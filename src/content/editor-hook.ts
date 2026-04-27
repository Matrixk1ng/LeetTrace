const MONACO_RESPONSE_TYPE = 'LEETTRACE_MONACO_EXTRACT_RESULT';
const MONACO_READY_TYPE = 'LEETTRACE_MONACO_EXTRACT_READY';
const MONACO_ERROR_TYPE = 'LEETTRACE_MONACO_EXTRACT_ERROR';
const DEBUG_STORAGE_KEY = 'leettrace.debug';

export function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function debugLog(message: string, meta?: Record<string, unknown>): void {
  if (!isDebugEnabled()) {
    return;
  }

  if (meta) {
    console.info('[LeetTrace][editor-hook]', message, meta);
    return;
  }

  console.info('[LeetTrace][editor-hook]', message);
}

function inferLanguageFromLabel(label: string): string {
  const normalized = label.toLowerCase().replace(/\s+/g, '');

  if (normalized.includes('python3')) return 'python3';
  if (normalized.includes('python')) return 'python';

  return 'unsupported';
}

function extractLanguageText(element: Element): string {
  return (element.textContent ?? '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLeetCodeLanguage(): string {
  const selectorCandidates = [
    // Current LeetCode language selector uses a Radix dialog trigger button.
    'button[aria-haspopup="dialog"][aria-controls^="radix-"]',
    'button[aria-haspopup="dialog"][data-state]',
    'button[data-e2e-locator="lang-select"]',
    '[data-e2e-locator="lang-select"]',
    'button[id*="lang-select"]',
    '[id*="lang-select"]',
    'button[aria-label*="language" i]',
    '[aria-label*="language" i]',
  ];

  const seen = new Set<Element>();

  for (const selector of selectorCandidates) {
    const matches = document.querySelectorAll(selector);

    for (const element of matches) {
      if (seen.has(element)) {
        continue;
      }

      seen.add(element);

      const text = extractLanguageText(element);
      if (!text) {
        continue;
      }

      const language = inferLanguageFromLabel(text);
      if (language !== 'unsupported') {
        return language;
      }
    }
  }

  // Fallback for selector drift: search all buttons for known language labels.
  const languageKeywords = [
    'python3',
    'python',
  ];

  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const text = extractLanguageText(button);
    if (!text) {
      continue;
    }

    const normalized = text.toLowerCase();
    const looksLikeLanguage = languageKeywords.some((keyword) => normalized.includes(keyword));
    if (!looksLikeLanguage) {
      continue;
    }

    return inferLanguageFromLabel(text);
  }

  return 'unsupported';
}

function injectMonacoReadScript(requestId: string): void {
  const script = document.createElement('script');
  const nonceElement = document.querySelector('[nonce]') as HTMLElement | null;
  const bridgeUrl = chrome.runtime.getURL('monaco-bridge.js');

  const nonce = nonceElement?.getAttribute('nonce') ?? null;
  if (nonce) {
    script.nonce = nonce;
    script.setAttribute('nonce', nonce);
  }

  script.src = bridgeUrl;
  script.async = false;
  script.setAttribute('data-request-id', requestId);
  script.setAttribute('data-response-type', MONACO_RESPONSE_TYPE);
  script.setAttribute('data-ready-type', MONACO_READY_TYPE);
  script.setAttribute('data-error-type', MONACO_ERROR_TYPE);

  script.addEventListener('load', () => {
    script.remove();
  });

  script.addEventListener('error', () => {
    window.postMessage({
      type: MONACO_ERROR_TYPE,
      requestId,
      reason: 'bridge-load-failed',
    }, window.location.origin);
    script.remove();
  });

  const mountNode = document.head ?? document.documentElement;
  mountNode.appendChild(script);
}

function extractFromMonacoApi(timeoutMs = 3200): Promise<string | null> {
  const requestId = `leettrace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    let scriptReady = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as {
        type?: string;
        requestId?: string;
        code?: unknown;
        reason?: string;
        detail?: string;
      };

      if (data?.requestId !== requestId) {
        return;
      }

      if (data?.type === MONACO_READY_TYPE) {
        scriptReady = true;
        debugLog('Monaco bridge script executed');
        return;
      }

      if (data?.type !== MONACO_RESPONSE_TYPE) {
        if (data?.type === MONACO_ERROR_TYPE) {
          cleanup();
          debugLog('Monaco bridge script failed', {
            reason: data.reason,
          });
          resolve(null);
        }
        return;
      }

      cleanup();
      debugLog('Monaco API extraction response received', {
        chars: typeof data.code === 'string' ? data.code.length : 0,
      });
      resolve(typeof data.code === 'string' ? data.code : null);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      debugLog('Monaco API extraction timed out; switching to DOM fallback', {
        bridgeExecuted: scriptReady,
      });
      resolve(null);
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
    };

    window.addEventListener('message', onMessage);
    injectMonacoReadScript(requestId);
  });
}

function extractFromDom(): string {
  const lines = Array.from(document.querySelectorAll('.view-lines .view-line'));

  if (lines.length === 0) {
    debugLog('DOM fallback found no editor lines');
    return '';
  }

  const code = lines
    .map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' '))
    .join('\n');

  debugLog('DOM fallback extracted code', {
    lines: lines.length,
    chars: code.length,
  });

  return code;
}

function extractExampleInputs(): string[] {
  const inputs: string[] = [];
  const seen = new Set<string>();

  // Match "Input: ..." up to the next Output:/Explanation:/Example label.
  const inputRegex = /Input:\s*([\s\S]+?)(?=\s*(?:Output:|Explanation:|Example\s*\d|Constraints?:|$))/gi;

  // Prefer <pre> blocks (classic LeetCode example layout); fall back to any element
  // mentioning Input: in case the problem description uses paragraphs instead.
  const candidates: Element[] = [
    ...Array.from(document.querySelectorAll('pre')),
    ...Array.from(document.querySelectorAll('div, p')).filter((el) => {
      const text = el.textContent ?? '';
      return text.includes('Input:') && text.length < 4000;
    }),
  ];

  for (const el of candidates) {
    const text = (el.textContent ?? '').replace(/ /g, ' ');
    inputRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(text)) !== null) {
      const cleaned = match[1].trim().replace(/\s+/g, ' ');
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      inputs.push(cleaned);
    }
    if (inputs.length > 0) break;
  }

  return inputs;
}

export async function extractCode(): Promise<{ code: string; language: string; examples: string[] }> {
  const language = detectLeetCodeLanguage();

  if (language === 'unsupported') {
    debugLog('Language unsupported; extraction skipped');
    return {
      code: '',
      language,
      examples: [],
    };
  }

  const monacoCode = await extractFromMonacoApi();
  const useMonaco = typeof monacoCode === 'string' && monacoCode.length > 0;
  const code = useMonaco ? monacoCode : extractFromDom();
  const examples = extractExampleInputs();

  debugLog(useMonaco ? 'Using Monaco API result' : 'Using DOM fallback result', {
    language,
    chars: code.length,
    examples: examples.length,
  });

  return {
    code,
    language,
    examples,
  };
}
