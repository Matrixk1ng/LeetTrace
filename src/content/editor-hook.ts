const MONACO_RESPONSE_TYPE = 'LEETTRACE_MONACO_EXTRACT_RESULT';
const DEBUG_STORAGE_KEY = 'leettrace.debug';

function isDebugEnabled(): boolean {
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

  if (normalized.includes('python3') || normalized === 'python') {
    return 'python3';
  }

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
    'c++',
    'java',
    'javascript',
    'typescript',
    'c#',
    'golang',
    'go',
    'rust',
    'swift',
    'kotlin',
    'php',
    'ruby',
    'scala',
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
  const nonceScript = document.querySelector('script[nonce]') as HTMLScriptElement | null;

  if (nonceScript?.nonce) {
    script.nonce = nonceScript.nonce;
  }

  script.textContent = `(() => {
    const startedAt = Date.now();
    const maxWaitMs = 2600;
    let finished = false;
    let amdAttempted = false;

    const postResult = (code) => {
      if (finished) {
        return;
      }

      finished = true;
      window.postMessage({
        type: '${MONACO_RESPONSE_TYPE}',
        requestId: '${requestId}',
        code,
      }, '*');
    };

    const readMonacoValue = (monacoApi) => {
      if (!monacoApi || !monacoApi.editor || typeof monacoApi.editor.getModels !== 'function') {
        return null;
      }

      const models = monacoApi.editor.getModels();
      if (!Array.isArray(models) || models.length === 0) {
        return null;
      }

      for (const model of models) {
        const value = model && typeof model.getValue === 'function' ? model.getValue() : null;
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
      }

      return null;
    };

    const findMonacoCandidates = () => {
      const win = window;
      const candidates = [win.monaco, win._monaco, win.Monaco];

      for (const key of Object.getOwnPropertyNames(win)) {
        if (!/monaco/i.test(key)) {
          continue;
        }

        try {
          candidates.push(win[key]);
        } catch {
          // Ignore inaccessible window properties.
        }
      }

      return candidates;
    };

    const readFromCandidates = () => {
      const candidates = findMonacoCandidates();
      for (const candidate of candidates) {
        try {
          const value = readMonacoValue(candidate);
          if (typeof value === 'string' && value.length > 0) {
            return value;
          }
        } catch {
          // Keep scanning candidates.
        }
      }

      return null;
    };

    const attemptAmdResolve = () => {
      const win = window;
      if (amdAttempted || typeof win.require !== 'function') {
        return;
      }

      amdAttempted = true;

      try {
        win.require(['vs/editor/editor.main'], (monacoApi) => {
          const value = readMonacoValue(monacoApi);
          if (typeof value === 'string' && value.length > 0) {
            postResult(value);
          }
        });
      } catch {
        // Keep polling through direct candidates.
      }
    };

    const tryRead = () => {
      const directValue = readFromCandidates();
      if (typeof directValue === 'string' && directValue.length > 0) {
        postResult(directValue);
        return;
      }

      attemptAmdResolve();

      if (Date.now() - startedAt >= maxWaitMs) {
        postResult('');
        return;
      }

      if (!finished) {
        window.setTimeout(tryRead, 80);
      }
    };

    try {
      tryRead();
    } catch {
      if (!finished) {
        postResult('');
      }
    }
  })();`;

  document.documentElement.appendChild(script);
  script.remove();
}

function extractFromMonacoApi(timeoutMs = 3200): Promise<string | null> {
  const requestId = `leettrace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as {
        type?: string;
        requestId?: string;
        code?: unknown;
      };

      if (data?.type !== MONACO_RESPONSE_TYPE || data?.requestId !== requestId) {
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
      debugLog('Monaco API extraction timed out; switching to DOM fallback');
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

export async function extractCode(): Promise<{ code: string; language: string }> {
  const language = detectLeetCodeLanguage();

  if (language === 'unsupported') {
    debugLog('Language unsupported; extraction skipped');
    return {
      code: '',
      language,
    };
  }

  const monacoCode = await extractFromMonacoApi();
  const useMonaco = typeof monacoCode === 'string' && monacoCode.length > 0;
  const code = useMonaco ? monacoCode : extractFromDom();

  debugLog(useMonaco ? 'Using Monaco API result' : 'Using DOM fallback result', {
    language,
    chars: code.length,
  });

  return {
    code,
    language,
  };
}
