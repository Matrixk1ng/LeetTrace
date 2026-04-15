import { extractCode } from './editor-hook';

const DEBUG_EVENT = 'LEETTRACE_DEBUG_EXTRACT';

function sendExtractedCode(payload: { code: string; language: string }): void {
	chrome.runtime.sendMessage({
		type: 'CODE_EXTRACTED',
		payload,
	});
}

async function runExtraction(source: 'runtime-message' | 'debug-event'): Promise<void> {
	const payload = await extractCode();

	console.info('[LeetTrace][content] extraction result', {
		source,
		language: payload.language,
		chars: payload.code.length,
	});

	sendExtractedCode(payload);
}

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
	if (message?.type !== 'EXTRACT_CODE') {
		return;
	}

	void runExtraction('runtime-message');
});

window.addEventListener(DEBUG_EVENT, () => {
	void runExtraction('debug-event');
});

console.info('[LeetTrace][content] ready. Trigger manual extraction with window.dispatchEvent(new Event(\'LEETTRACE_DEBUG_EXTRACT\'))');
