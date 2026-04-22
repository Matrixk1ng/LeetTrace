import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from 'react';
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
      payload: string;
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
  speed: 500,
  error: null,
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
        totalSteps: Math.max(0, snapshots.length - 1),
        currentStep: 0,
        status: 'paused',
        error: null,
        detectedPattern: action.payload.pattern ?? null,
      };
    }

    case 'SET_STEP': {
      const step = Math.max(0, Math.min(action.payload, state.totalSteps));
      return {
        ...state,
        currentStep: step,
      };
    }

    case 'NEXT_STEP': {
      const nextStep = Math.min(state.currentStep + 1, state.totalSteps);
      return {
        ...state,
        currentStep: nextStep,
        status: nextStep >= state.totalSteps ? 'completed' : state.status,
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
      return {
        ...state,
        status: 'running',
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
        status: 'paused',
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        status: 'error',
        error: action.payload,
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

  return {
    state,
    dispatch,
    currentSnapshot,
  };
}
