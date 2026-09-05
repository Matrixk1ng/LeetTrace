import { useReducer, type ReactNode } from 'react';
import { initialState, traceReducer } from './traceReducer';
import { TraceContext } from './useTrace';

/**
 * TraceProvider component - wraps the app with trace context.
 */
export function TraceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(traceReducer, initialState);

  return (
    <TraceContext.Provider value={{ state, dispatch }}>
      {children}
    </TraceContext.Provider>
  );
}
