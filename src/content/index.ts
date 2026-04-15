import { extractCode, isDebugEnabled } from './editor-hook';
import { injectFAB } from './fab';
import { clearGutterAnnotations, updateGutterAnnotations, type GutterAnnotation } from './gutter';

const DEBUG_EVENT = 'LEETTRACE_DEBUG_EXTRACT';
const DEBUG_GUTTER_UPDATE_EVENT = 'LEETTRACE_DEBUG_GUTTER_UPDATE';
const DEBUG_GUTTER_CLEAR_EVENT = 'LEETTRACE_DEBUG_GUTTER_CLEAR';
const EDITOR_POLL_INTERVAL_MS = 500;
const GUTTER_CLEAR_DEBOUNCE_MS = 1000;

let editorObserver: MutationObserver | null = null;
let clearDebounceTimer: number | null = null;

interface RuntimeMessage {
	type?: string;
	payload?: {
		line?: number;
		annotations?: GutterAnnotation[];
	};
}

async function runExtraction(source: 'runtime-message' | 'debug-event'): Promise<{ code: string; language: string }> {
	const payload = await extractCode();

	if (isDebugEnabled()) {
		console.info('[LeetTrace][content] extraction result', {
			source,
			language: payload.language,
			chars: payload.code.length,
		});
	}

	return payload;
}

function scheduleGutterClear(): void {
	if (clearDebounceTimer !== null) {
		window.clearTimeout(clearDebounceTimer);
	}

	clearDebounceTimer = window.setTimeout(() => {
		clearGutterAnnotations();
		clearDebounceTimer = null;
	}, GUTTER_CLEAR_DEBOUNCE_MS);
}

function attachEditorObserver(editorRoot: Element): void {
	if (editorObserver) {
		return;
	}

	const observeTarget = editorRoot.querySelector('.view-lines') ?? editorRoot;

	editorObserver = new MutationObserver(() => {
		scheduleGutterClear();
	});

	editorObserver.observe(observeTarget, {
		childList: true,
		subtree: true,
		characterData: true,
	});
}

function waitForMonacoEditorAndObserve(): void {
	const pollId = window.setInterval(() => {
		const editorRoot = document.querySelector('.monaco-editor');
		if (!editorRoot) {
			return;
		}

		window.clearInterval(pollId);
		attachEditorObserver(editorRoot);
	}, EDITOR_POLL_INTERVAL_MS);
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
	if (message?.type === 'EXTRACT_CODE') {
		void runExtraction('runtime-message')
			.then((payload) => {
				sendResponse({ ok: true, payload });
			})
			.catch((error: unknown) => {
				const fallbackPayload = { code: '', language: 'unsupported' };
				console.warn('[LeetTrace][content] EXTRACT_CODE failed', error);
				sendResponse({ ok: false, payload: fallbackPayload });
			});

		return true;
	}

	if (message?.type === 'UPDATE_GUTTER') {
		const line = message.payload?.line;
		const annotations = message.payload?.annotations;

		if (typeof line === 'number' && Array.isArray(annotations)) {
			updateGutterAnnotations(line, annotations);
		}

		return;
	}

	if (message?.type === 'CLEAR_GUTTER') {
		clearGutterAnnotations();
	}

	return false;
});

if (isDebugEnabled()) {
	window.addEventListener(DEBUG_EVENT, () => {
		void runExtraction('debug-event');
	});

	window.addEventListener(DEBUG_GUTTER_UPDATE_EVENT, () => {
		updateGutterAnnotations(0, [
			{ variable: 'i', value: '2', changed: true },
			{ variable: 'num', value: '7', changed: false },
		]);
	});

	window.addEventListener(DEBUG_GUTTER_CLEAR_EVENT, () => {
		clearGutterAnnotations();
	});
}

injectFAB();
waitForMonacoEditorAndObserve();

console.info(
	'[LeetTrace][content] ready. Debug events: LEETTRACE_DEBUG_EXTRACT, LEETTRACE_DEBUG_GUTTER_UPDATE, LEETTRACE_DEBUG_GUTTER_CLEAR'
);
