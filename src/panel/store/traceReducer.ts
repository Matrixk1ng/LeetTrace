import { DEFAULT_SPEED } from '../../shared/constants';
import type {
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
  snapshots: Snapshot[];
  currentStep: number;
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
  | {
      type: 'CLEAR';
    };

/**
 * Initial state
 */
export const initialState: TraceState = {
  status: 'idle',
  snapshots: [],
  currentStep: 0,
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
        totalSteps: snapshots.length,
        currentStep: 0,
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
      };
    }

    case 'NEXT_STEP': {
      const maxStep = Math.max(state.totalSteps - 1, 0);
      const nextStep = Math.min(state.currentStep + 1, maxStep);
      return {
        ...state,
        currentStep: nextStep,
      };
    }

    case 'PREV_STEP': {
      const prevStep = Math.max(state.currentStep - 1, 0);
      return {
        ...state,
        currentStep: prevStep,
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
        error: null,
        errorLine: null,
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
        status: state.totalSteps > 0 ? 'paused' : 'idle',
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        status: 'error',
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

    case 'CLEAR': {
      return initialState;
    }

    default:
      return state;
  }
}
