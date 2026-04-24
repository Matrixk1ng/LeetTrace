import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from 'react';
import { DEFAULT_SPEED } from '../../shared/constants';
import type { Snapshot, ExecutionStatus, DetectedPattern } from '../../shared/types';

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
}

/**
 * Discriminated union of all possible actions
 */
export type TraceAction =
  | {
      type: 'LOAD_SNAPSHOTS';
      payload: {
        snapshots: Snapshot[];
        pattern?: DetectedPattern;
      };
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
const initialState: TraceState = {
  status: 'idle',
  snapshots: [],
  currentStep: 0,
  totalSteps: 0,
  speed: DEFAULT_SPEED,
  error: null,
  errorLine: null,
  loadingMessage: null,
  detectedPattern: null,
};

/**
 * Reducer function for trace state
 */
function traceReducer(state: TraceState, action: TraceAction): TraceState {
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

/**
 * Context type for the trace provider value
 */
interface TraceContextType {
  state: TraceState;
  dispatch: React.Dispatch<TraceAction>;
}

/**
 * Create the trace context
 */
const TraceContext = createContext<TraceContextType | undefined>(undefined);

/**
 * TraceProvider component - wraps the app with trace context
 */
export function TraceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(traceReducer, initialState);

  return (
    <TraceContext.Provider value={{ state, dispatch }}>
      {children}
    </TraceContext.Provider>
  );
}

/**
 * Custom hook to use the trace context
 * Provides state, dispatch, and computed currentSnapshot
 */
export function useTrace() {
  const context = useContext(TraceContext);
  if (!context) {
    throw new Error('useTrace must be used within a TraceProvider');
  }

  const { state, dispatch } = context;
  const currentSnapshot = state.snapshots[state.currentStep] ?? null;
  const isAtStart = state.currentStep <= 0;
  const isAtEnd = state.totalSteps === 0 || state.currentStep >= state.totalSteps - 1;

  return {
    state,
    dispatch,
    currentSnapshot,
    isAtStart,
    isAtEnd,
  };
}
