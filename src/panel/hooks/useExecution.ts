import { useEffect, useRef } from 'react';
import type { Snapshot, DetectedPattern, GutterAnnotation } from '../../shared/types';
import { useTrace } from '../store/TraceContext';

function isRuntimeMessage(message: unknown): message is { type: string; payload?: { progress?: number; error?: string; line?: number; snapshots?: unknown[]; pattern?: unknown } } {
  return typeof message === 'object' && message !== null && 'type' in message;
}

const MAX_GUTTER_VARS = 4;

function buildGutterAnnotations(snapshot: Snapshot | null): GutterAnnotation[] {
  if (!snapshot) return [];
  const entries = Object.entries(snapshot.variables);
  // Show changed variables first, then a few stable ones, capped so the badge fits.
  entries.sort(([, a], [, b]) => Number(b.changed) - Number(a.changed));
  return entries.slice(0, MAX_GUTTER_VARS).map(([variable, v]) => ({
    variable,
    value: formatGutterValue(v.value),
    changed: v.changed,
  }));
}

function formatGutterValue(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const text = JSON.stringify(value);
    return text.length > 24 ? text.slice(0, 23) + '…' : text;
  }
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 24 ? text.slice(0, 23) + '…' : text;
  }
  return String(value);
}

export function useExecution() {
  const { state, dispatch, isAtEnd, currentSnapshot } = useTrace();
  const intervalRef = useRef<number | null>(null);
  const leetcodeTabIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      if (!isRuntimeMessage(message)) {
        return;
      }

      if (message.type === 'PYODIDE_LOADING') {
        const progress = message.payload?.progress;
        const suffix = typeof progress === 'number' ? ` (${progress}%)` : '';
        dispatch({ type: 'SET_LOADING', payload: `Loading Python runtime...${suffix}` });
      }

      if (message.type === 'PYODIDE_READY' && state.status === 'loading') {
        dispatch({ type: 'SET_LOADING', payload: 'Running your code...' });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [dispatch, state.status]);

  // Mirror the active step into the LeetCode editor: highlight the current
  // line and show inline variable badges. Clear when there's nothing to show.
  useEffect(() => {
    const tabId = leetcodeTabIdRef.current;
    if (typeof tabId !== 'number') return;

    if (state.status === 'idle' || state.status === 'error' || state.totalSteps === 0) {
      void chrome.tabs.sendMessage(tabId, { type: 'CLEAR_GUTTER' }).catch(() => {});
      return;
    }

    if (!currentSnapshot) return;
    // Python lines are 1-indexed; Monaco view-line indices are 0-indexed.
    const editorLine = Math.max(0, currentSnapshot.line - 1);
    const annotations = buildGutterAnnotations(currentSnapshot);

    void chrome.tabs
      .sendMessage(tabId, {
        type: 'UPDATE_GUTTER',
        payload: { line: editorLine, annotations },
      })
      .catch(() => {});
  }, [currentSnapshot, state.status, state.totalSteps]);

  useEffect(() => {
    if (state.status !== 'running') {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (isAtEnd) {
      dispatch({ type: 'PAUSE' });
      return;
    }

    intervalRef.current = window.setInterval(() => {
      if (isAtEnd) {
        dispatch({ type: 'PAUSE' });
        return;
      }

      dispatch({ type: 'NEXT_STEP' });
    }, state.speed);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [dispatch, isAtEnd, state.speed, state.status]);

  const requestTrace = async () => {
    console.log('[LeetTrace] requestTrace called');
    dispatch({ type: 'CLEAR' });

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      const tabId = activeTab?.id;
      console.log('[LeetTrace] active tab:', tabId, activeTab?.url);

      if (!tabId) {
        console.warn('[LeetTrace] no active tab found');
        dispatch({ type: 'SET_ERROR', payload: { message: 'Unable to find the active tab.' } });
        return;
      }

      leetcodeTabIdRef.current = tabId;

      let extracted: { ok: boolean; payload: { code: string; language: string; examples?: string[] } } | undefined;
      try {
        // Route through background so it can inject the content script if needed
        extracted = await chrome.runtime.sendMessage({ type: 'EXTRACT_CODE' }) as typeof extracted;
      } catch (e) {
        console.warn('[LeetTrace] EXTRACT_CODE failed:', e);
      }
      const code = extracted?.payload?.code?.trim() ?? '';
      const language = extracted?.payload?.language?.toLowerCase() ?? '';
      const examples = extracted?.payload?.examples ?? [];
      console.log('[LeetTrace] extracted code length:', code.length, 'language:', language, 'examples:', examples.length);

      if (!code) {
        dispatch({ type: 'SET_ERROR', payload: { message: 'No code found in the active editor.' } });
        return;
      }

      if (!language.includes('python')) {
        dispatch({ type: 'SET_ERROR', payload: { message: 'Only Python solutions are supported right now.' } });
        return;
      }

      dispatch({ type: 'SET_LOADING', payload: 'Running your code...' });

      console.log('[LeetTrace] sending EXECUTE_CODE to background');
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_CODE',
        payload: { code, examples },
      }) as
        | { type: 'EXECUTION_RESULT'; payload: { snapshots: Snapshot[]; pattern?: DetectedPattern } }
        | { type: 'EXECUTION_ERROR'; payload: { error: string; line?: number } }
        | undefined;
      console.log('[LeetTrace] background response:', response);

      if (!response) {
        dispatch({ type: 'SET_ERROR', payload: { message: 'No response from the background worker.' } });
        return;
      }

      if (response.type === 'EXECUTION_ERROR') {
        dispatch({
          type: 'SET_ERROR',
          payload: { message: response.payload.error, line: response.payload.line },
        });
        return;
      }

      dispatch({
        type: 'LOAD_SNAPSHOTS',
        payload: {
          snapshots: response.payload.snapshots,
          pattern: response.payload.pattern,
        },
      });
    } catch (error) {
      console.error('[LeetTrace] requestTrace error:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: {
          message: error instanceof Error ? error.message : 'Unable to start tracing.',
        },
      });
    }
  };

  return {
    requestTrace,
  };
}