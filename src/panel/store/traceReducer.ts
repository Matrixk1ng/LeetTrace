import { DEFAULT_SPEED } from '../../shared/constants';
import type {
  SelectedTestCase,
  Snapshot,
  ExecutionStatus,
  DetectedPattern,
  TraceLimit,
  TraceResult,
} from '../../shared/types';

/**
 * Complete state for execution tracing
 */
export interface TraceState {
  status: ExecutionStatus;
  stale: boolean;
  inputChanged: boolean;
  testCase: SelectedTestCase | null;
  snapshots: Snapshot[];
  currentStep: number;
  /**
   * The step navigated away from, which is not always `currentStep - 1`
   * (bug B17). Visualizers diff against this so stepping *backwards* shows
   * what actually changed instead of re-reporting the step ahead as new.
   * Null before the first move.
   */
  previousStep: number | null;
  totalSteps: number;
  speed: number; // ms per step
  error: string | null;
  errorLine: number | null;
  loadingMessage: string | null;
  detectedPattern: DetectedPattern | null;
  /** A budget cut the trace short; `limit` says which one (M8 surfaces it). */
  truncated: boolean;
  limit: TraceLimit | null;
  /** The solution's return value, in LeetCode's own encoding. */
  returnValue: unknown;
}

/**
 * Discriminated union of all possible actions
 */
export type TraceAction =
  | {
      type: 'LOAD_SNAPSHOTS';
      payload: TraceResult;
    }
  | {
      type: 'SET_STEP';
      payload: number;
    }
  | {
      type: 'NEXT_STEP';
    }
  | {
      type: 'PREV_STEP';
    }
  | {
      type: 'SET_SPEED';
      payload: number;
    }
  | {
      type: 'PLAY';
    }
  | {
      type: 'PAUSE';
    }
  | {
      type: 'RESET';
    }
  | {
      type: 'SET_ERROR';
      payload: {
        message: string;
        line?: number;
      };
    }
  | {
      type: 'SET_LOADING';
      payload: string;
    }
  | {
      type: 'SET_PATTERN';
      payload: DetectedPattern | null;
    }
  | { type: 'MARK_STALE' }
  | { type: 'INPUT_CHANGED' }
  | { type: 'SET_TESTCASE'; payload: SelectedTestCase | null }
  | {
      type: 'CLEAR';
    };

/**
 * Initial state
 */
export const initialState: TraceState = {
  status: 'idle',
  stale: false,
  inputChanged: false,
  testCase: null,
  snapshots: [],
  currentStep: 0,
  previousStep: null,
  totalSteps: 0,
  speed: DEFAULT_SPEED,
  error: null,
  errorLine: null,
  loadingMessage: null,
  detectedPattern: null,
  truncated: false,
  limit: null,
  returnValue: undefined,
};

/**
 * Reducer function for trace state
 */
export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case 'LOAD_SNAPSHOTS': {
      const snapshots = action.payload.snapshots;
      return {
        ...state,
        snapshots,
        stale: false,
        inputChanged: false,
        totalSteps: snapshots.length,
        currentStep: 0,
        previousStep: null,
        status: snapshots.length > 0 ? 'paused' : 'completed',
        error: null,
        errorLine: null,
        loadingMessage: null,
        detectedPattern: action.payload.pattern ?? null,
        truncated: action.payload.truncated ?? false,
        limit: action.payload.limit ?? null,
        returnValue: action.payload.returnValue,
      };
    }

    case 'SET_STEP': {
      const maxStep = Math.max(state.totalSteps - 1, 0);
      const step = Math.max(0, Math.min(action.payload, maxStep));
      return {
        ...state,
        currentStep: step,
        previousStep: step === state.currentStep ? state.previousStep : state.currentStep,
      };
    }

    case 'NEXT_STEP': {
      const maxStep = Math.max(state.totalSteps - 1, 0);
      const nextStep = Math.min(state.currentStep + 1, maxStep);
      return {
        ...state,
        currentStep: nextStep,
        previousStep: nextStep === state.currentStep ? state.previousStep : state.currentStep,
      };
    }

    case 'PREV_STEP': {
      const prevStep = Math.max(state.currentStep - 1, 0);
      return {
        ...state,
        currentStep: prevStep,
        previousStep: prevStep === state.currentStep ? state.previousStep : state.currentStep,
      };
    }

    case 'SET_SPEED': {
      return {
        ...state,
        speed: action.payload,
      };
    }

    case 'PLAY': {
      if (state.totalSteps === 0) {
        return state;
      }

      return {
        ...state,
        status: 'running',
        currentStep: state.currentStep >= state.totalSteps - 1 ? 0 : state.currentStep,
        previousStep: state.currentStep >= state.totalSteps - 1 ? null : state.previousStep,
      };
    }

    case 'PAUSE': {
      return {
        ...state,
        status: 'paused',
      };
    }

    case 'RESET': {
      return {
        ...state,
        currentStep: 0,
        previousStep: null,
        status: state.totalSteps > 0 ? 'paused' : 'idle',
      };
    }

    case 'SET_ERROR': {
      const errorStep = state.snapshots.findLastIndex(s => s.line === action.payload.line);
      return {
        ...state,
        status: 'error',
        currentStep: errorStep >= 0 ? errorStep : Math.max(0, state.totalSteps - 1),
        error: action.payload.message,
        errorLine: action.payload.line ?? null,
        loadingMessage: null,
      };
    }

    case 'SET_LOADING': {
      return {
        ...state,
        status: 'loading',
        loadingMessage: action.payload,
        error: null,
        errorLine: null,
      };
    }

    case 'SET_PATTERN': {
      return {
        ...state,
        detectedPattern: action.payload,
      };
    }

    case 'SET_TESTCASE':
      return { ...state, testCase: action.payload };
    case 'INPUT_CHANGED':
      return { ...state, stale: true, inputChanged: true, status: state.status === 'running' ? 'paused' : state.status };
    case 'MARK_STALE':
      return { ...state, stale: true, status: state.status === 'running' ? 'paused' : state.status };
    case 'CLEAR': {
      return initialState;
    }

    default:
      return state;
  }
}
