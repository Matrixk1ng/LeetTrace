/**
 * The trace context object and its consumer hook.
 *
 * Kept out of TraceContext.tsx so that file exports only the provider
 * component — React Fast Refresh can't handle a module that mixes components
 * with other exports.
 */

import { createContext, useContext } from 'react';
import type { TraceAction, TraceState } from './traceReducer';

export interface TraceContextType {
  state: TraceState;
  dispatch: React.Dispatch<TraceAction>;
}

export const TraceContext = createContext<TraceContextType | undefined>(undefined);

/**
 * Reads trace state, plus the derived cursor values every consumer needs.
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
