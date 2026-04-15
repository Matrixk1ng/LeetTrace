(() => {
  const script = document.currentScript;
  const requestId = script?.getAttribute('data-request-id') ?? '';
  const responseType = script?.getAttribute('data-response-type') ?? 'LEETTRACE_MONACO_EXTRACT_RESULT';
  const readyType = script?.getAttribute('data-ready-type') ?? 'LEETTRACE_MONACO_EXTRACT_READY';
  const errorType = script?.getAttribute('data-error-type') ?? 'LEETTRACE_MONACO_EXTRACT_ERROR';

  if (!requestId) {
    return;
  }

  const post = (type, extra = {}) => {
    window.postMessage(
      {
        type,
        requestId,
        ...extra,
      },
      window.location.origin
    );
  };

  const startedAt = Date.now();
  const maxWaitMs = 2600;
  let finished = false;

  const postResult = (code) => {
    if (finished) {
      return;
    }

    finished = true;
    post(responseType, { code });
  };

  const isVisibleElement = (element) => {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const getEditorValue = (editor) => {
    if (!editor) {
      return null;
    }

    if (typeof editor.getValue === 'function') {
      try {
        const direct = editor.getValue();
        if (typeof direct === 'string' && direct.length > 0) {
          return direct;
        }
      } catch {
        // Ignore editor getValue failures and try model fallback.
      }
    }

    if (typeof editor.getModel !== 'function') {
      return null;
    }

    try {
      const model = editor.getModel();
      const value = model && typeof model.getValue === 'function' ? model.getValue() : null;
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  };

  const selectBestEditor = (editors) => {
    let bestEditor = null;
    let bestScore = -1;

    for (const editor of editors) {
      let score = 0;
      const domNode = typeof editor.getDomNode === 'function' ? editor.getDomNode() : null;

      if (isVisibleElement(domNode)) {
        score += 100;
      }

      if (domNode && document.activeElement && domNode.contains(document.activeElement)) {
        score += 100;
      }

      const value = getEditorValue(editor);
      if (typeof value === 'string' && value.length > 0) {
        score += 40;
        score += Math.min(value.length, 4000) / 200;
      }

      if (score > bestScore) {
        bestScore = score;
        bestEditor = editor;
      }
    }

    return bestEditor;
  };

  const readFromModels = (models) => {
    if (!Array.isArray(models) || models.length === 0) {
      return null;
    }

    let bestValue = null;
    let bestScore = -1;

    for (const model of models) {
      const value = model && typeof model.getValue === 'function' ? model.getValue() : null;
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }

      let score = Math.min(value.length, 5000) / 100;

      try {
        const uri =
          model && model.uri && typeof model.uri.toString === 'function'
            ? model.uri.toString().toLowerCase()
            : '';
        if (uri.includes('solution') || uri.includes('editor') || uri.includes('user')) {
          score += 10;
        }
      } catch {
        // Ignore URI issues.
      }

      try {
        const lang = typeof model.getLanguageId === 'function' ? model.getLanguageId() : '';
        if (lang && lang !== 'plaintext') {
          score += 6;
        }
      } catch {
        // Ignore language issues.
      }

      if (score > bestScore) {
        bestScore = score;
        bestValue = value;
      }
    }

    return bestValue;
  };

  const getMonacoCandidates = () => {
    const candidates = [window.monaco, window._monaco, window.Monaco];

    for (const key of Object.getOwnPropertyNames(window)) {
      if (!/monaco/i.test(key)) {
        continue;
      }

      try {
        candidates.push(window[key]);
      } catch {
        // Ignore inaccessible window properties.
      }
    }

    return candidates;
  };

  const readMonacoValue = () => {
    const candidates = getMonacoCandidates();

    for (const monacoApi of candidates) {
      try {
        const editorApi = monacoApi && monacoApi.editor;
        if (!editorApi) {
          continue;
        }

        if (typeof editorApi.getEditors === 'function') {
          const editors = editorApi.getEditors();
          if (Array.isArray(editors) && editors.length > 0) {
            const bestEditor = selectBestEditor(editors);
            const editorValue = getEditorValue(bestEditor);
            if (typeof editorValue === 'string' && editorValue.length > 0) {
              return editorValue;
            }
          }
        }

        if (typeof editorApi.getModels === 'function') {
          const modelValue = readFromModels(editorApi.getModels());
          if (typeof modelValue === 'string' && modelValue.length > 0) {
            return modelValue;
          }
        }
      } catch {
        // Keep scanning Monaco candidates.
      }
    }

    return null;
  };

  const tryRead = () => {
    const directValue = readMonacoValue();
    if (typeof directValue === 'string' && directValue.length > 0) {
      postResult(directValue);
      return;
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      postResult('');
      return;
    }

    if (!finished) {
      window.setTimeout(tryRead, 80);
    }
  };

  post(readyType);

  try {
    tryRead();
  } catch (error) {
    post(errorType, {
      reason: 'bridge-runtime-error',
      detail: error instanceof Error ? error.message : 'unknown',
    });

    if (!finished) {
      postResult('');
    }
  }
})();
