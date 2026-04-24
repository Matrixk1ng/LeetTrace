import { useEffect, useRef } from 'react';
import { mockExecutionResult } from '../mockData';
import { useTrace } from '../store/TraceContext';

function isRuntimeMessage(message: unknown): message is { type: string; payload?: { progress?: number; error?: string; line?: number; snapshots?: unknown[]; pattern?: unknown } } {
  return typeof message === 'object' && message !== null && 'type' in message;
}

export function useExecution() {
  const { state, dispatch, isAtEnd } = useTrace();
  const intervalRef = useRef<number | null>(null);
  const mockLoadedRef = useRef(false);

  useEffect(() => {
    if (!mockLoadedRef.current) {
      dispatch({
        type: 'LOAD_SNAPSHOTS',
        payload: {
          snapshots: mockExecutionResult.snapshots,
          pattern: mockExecutionResult.pattern,
        },
      });
      mockLoadedRef.current = true;
    }
  }, [dispatch]);

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

      let extracted: { ok: boolean; payload: { code: string; language: string } } | undefined;
      try {
        // Route through background so it can inject the content script if needed
        extracted = await chrome.runtime.sendMessage({ type: 'EXTRACT_CODE' }) as typeof extracted;
      } catch (e) {
        console.warn('[LeetTrace] EXTRACT_CODE failed:', e);
      }
      const code = extracted?.payload?.code?.trim() ?? '';
      const language = extracted?.payload?.language?.toLowerCase() ?? '';
      console.log('[LeetTrace] extracted code length:', code.length, 'language:', language);

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
        payload: { code },
      }) as
        | { type: 'EXECUTION_RESULT'; payload: { snapshots: typeof mockExecutionResult.snapshots; pattern?: typeof mockExecutionResult.pattern } }
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