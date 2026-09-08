import { formatTraceValue, visibleVariables } from '../../shared/display';
import { useEffect, useRef } from 'react';
import type {
  ExecutionResponse,
  ExtractCodeResponse,
  GutterAnnotation,
  Message,
  Snapshot,
} from '../../shared/types';
import { useTrace } from '../store/useTrace';

function isRuntimeMessage(message: unknown): message is Message {
  return typeof message === 'object' && message !== null && 'type' in message;
}

const MAX_GUTTER_VARS = 4;

function buildGutterAnnotations(snapshot: Snapshot | null): GutterAnnotation[] {
  if (!snapshot) return [];
  const referenced = new Set(snapshot.visual?.names ?? []);
  return visibleVariables(snapshot)
    // Diagrams belong in the panel. Keep editor badges short and scalar-only,
    // including Python's serialized non-finite floats but not object reprs.
    .filter(([, v]) => ['int', 'float', 'bool', 'NoneType', 'str'].includes(v.type) &&
      (v.value === null || typeof v.value === 'number' || typeof v.value === 'boolean' ||
        typeof v.value === 'string' && v.value.length <= 24))
    .sort(([a], [b]) => Number(referenced.has(b)) - Number(referenced.has(a)))
    .slice(0, MAX_GUTTER_VARS).map(([variable, v]) => ({
    variable, value: formatTraceValue(v.value, v.type), changed: v.changed,
  }));
}

export function useExecution() {
  const { state, dispatch, isAtEnd, currentSnapshot } = useTrace();
  const staleRef = useRef(false);
  const inFlightRef = useRef(false);
  const retracePendingRef = useRef(false);
  const requestRef = useRef<(() => Promise<void>) | null>(null);
  const retraceTimerRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | null>(null);
  const leetcodeTabIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMessage = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (!isRuntimeMessage(message)) {
        return;
      }

      if (message.type === 'TESTCASE_CHANGED' && sender.tab?.id === leetcodeTabIdRef.current) {
        staleRef.current = true;
        retracePendingRef.current = true;
        dispatch({ type: 'INPUT_CHANGED' });
        window.clearTimeout(retraceTimerRef.current);
        retraceTimerRef.current = window.setTimeout(() => {
          if (!inFlightRef.current) void requestRef.current?.();
        }, 400);
      }

      if (message.type === 'TRACE_STALE' && sender.tab?.id === leetcodeTabIdRef.current) {
        staleRef.current = true;
        dispatch({ type: 'MARK_STALE' });
      }

      if (message.type === 'PYODIDE_LOADING' && state.status === 'loading') {
        const progress = message.payload.progress;
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

    if (state.status === 'idle' || state.stale || state.totalSteps === 0) {
      void chrome.tabs
        .sendMessage(tabId, { type: 'CLEAR_GUTTER' } satisfies Message)
        .catch(() => {});
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
      } satisfies Message)
      .catch(() => {});
  }, [currentSnapshot, state.status, state.totalSteps, state.stale]);

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
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    retracePendingRef.current = false;
    console.log('[LeetTrace] requestTrace called');
    dispatch({ type: 'CLEAR' });
    staleRef.current = false;
    dispatch({ type: 'SET_LOADING', payload: 'Reading selected testcase…' });

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

      let extracted: ExtractCodeResponse | undefined;
      try {
        // Routed through the background worker so it can re-inject the content
        // script when the page has none (B7).
        extracted = await chrome.runtime.sendMessage(
          { type: 'EXTRACT_CODE' } satisfies Message,
        ) as ExtractCodeResponse | undefined;
      } catch (e) {
        console.warn('[LeetTrace] EXTRACT_CODE failed:', e);
      }
      if (extracted && !extracted.ok) {
        dispatch({ type: 'SET_ERROR', payload: { message: extracted.error ?? 'Could not read LeetCode’s selected testcase.' } });
        return;
      }
      dispatch({ type: 'SET_TESTCASE', payload: extracted?.payload.testCase ?? null });
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
      } satisfies Message) as ExecutionResponse | undefined;
      console.log('[LeetTrace] background response:', response);

      if (retracePendingRef.current) return;

      if (!response) {
        dispatch({ type: 'SET_ERROR', payload: { message: 'No response from the background worker.' } });
        return;
      }

      if (response.type === 'EXECUTION_ERROR') {
        if (response.payload.trace) dispatch({ type: 'LOAD_SNAPSHOTS', payload: response.payload.trace });
        if (staleRef.current) dispatch({ type: 'MARK_STALE' });
        dispatch({
          type: 'SET_ERROR',
          payload: { message: response.payload.error, line: response.payload.line },
        });
        return;
      }

      dispatch({ type: 'LOAD_SNAPSHOTS', payload: response.payload });
      if (staleRef.current) dispatch({ type: 'MARK_STALE' });
    } catch (error) {
      console.error('[LeetTrace] requestTrace error:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: {
          message: error instanceof Error ? error.message : 'Unable to start tracing.',
        },
      });
    } finally {
      inFlightRef.current = false;
      if (retracePendingRef.current) {
        window.clearTimeout(retraceTimerRef.current);
        retraceTimerRef.current = window.setTimeout(() => { void requestRef.current?.(); }, 400);
      }
    }
  };

  useEffect(() => {
    requestRef.current = requestTrace;
  });
  useEffect(() => () => {
    window.clearTimeout(retraceTimerRef.current);
    requestRef.current = null;
  }, []);

  return {
    requestTrace,
  };
}
