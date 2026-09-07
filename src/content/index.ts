import { watchTestCases } from './testcase';
import { extractCode, isDebugEnabled } from './editor-hook';
import { injectFAB } from './fab';
import { clearGutterAnnotations, updateGutterAnnotations, repositionGutterAnnotations } from './gutter';
import type { ExtractCodeResponse, Message } from '../shared/types';

const DEBUG_EVENT = 'LEETTRACE_DEBUG_EXTRACT';
const DEBUG_GUTTER_UPDATE_EVENT = 'LEETTRACE_DEBUG_GUTTER_UPDATE';
const DEBUG_GUTTER_CLEAR_EVENT = 'LEETTRACE_DEBUG_GUTTER_CLEAR';
const EDITOR_POLL_INTERVAL_MS = 500;
let editorObserver: MutationObserver | null = null;
let observedRoot: Element | null = null;
let stale = false;

const testCaseWatcher = watchTestCases(() => {
  clearGutterAnnotations();
  stale = true;
  void chrome.runtime.sendMessage({ type: 'TESTCASE_CHANGED' } satisfies Message).catch(() => {});
});

function markStale(): void {
  clearGutterAnnotations();
  if (stale) return;
  stale = true;
  void chrome.runtime.sendMessage({ type: 'TRACE_STALE' } satisfies Message).catch(() => {});
}

window.addEventListener('message', event => {
  if (event.source === window && event.origin === window.location.origin &&
      event.data?.type === 'LEETTRACE_MODEL_CHANGED') markStale();
});
window.addEventListener('popstate', markStale);
document.addEventListener('input', event => {
  if ((event.target as Element)?.closest('.monaco-editor')) markStale();
});

async function runExtraction(source: 'runtime-message' | 'debug-event'): Promise<ExtractCodeResponse['payload']> {
	const payload = await extractCode();
	stale = false;
	testCaseWatcher.reset();

	if (isDebugEnabled()) {
		console.info('[LeetTrace][content] extraction result', {
			source,
			language: payload.language,
			chars: payload.code.length,
			examples: payload.examples.length,
		});
	}

	return payload;
}

function waitForMonacoEditorAndObserve(): void {
  window.setInterval(() => {
    const root = document.querySelector('.monaco-editor');
    if (root === observedRoot) return;
    if (observedRoot) markStale();
    editorObserver?.disconnect();
    observedRoot = root;
    if (!root) return;
    editorObserver = new MutationObserver(repositionGutterAnnotations);
    editorObserver.observe(root.querySelector('.view-lines') ?? root, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
  }, EDITOR_POLL_INTERVAL_MS);
}

chrome.runtime.onMessage.addListener((
	message: Message,
	_sender,
	sendResponse: (response: ExtractCodeResponse) => void,
) => {
	if (message?.type === 'EXTRACT_CODE') {
		void runExtraction('runtime-message')
			.then((payload) => {
				sendResponse({ ok: true, payload });
			})
			.catch((error: unknown) => {
				const fallbackPayload = { code: '', language: 'unsupported', examples: [] };
				console.warn('[LeetTrace][content] EXTRACT_CODE failed', error);
				sendResponse({ ok: false, payload: fallbackPayload, error: error instanceof Error ? error.message : 'Could not read the selected testcase.' });
			});

		return true;
	}

	if (message?.type === 'UPDATE_GUTTER') {
		const { line, annotations } = message.payload;

		if (!stale && typeof line === 'number' && Array.isArray(annotations)) {
			updateGutterAnnotations(line, annotations);
		}

		return false;
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
