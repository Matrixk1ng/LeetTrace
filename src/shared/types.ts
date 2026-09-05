/**
 * The contract between all four extension contexts (content script,
 * background service worker, offscreen document + its Pyodide worker, and the
 * side panel). Every sender and receiver imports `Message` from here — no
 * ad-hoc inline message shapes (bug B12).
 */

// ---------------------------------------------------------------------------
// Snapshot schema v2 (docs/DESIGN.md §4)
// ---------------------------------------------------------------------------

export type TraceEvent = 'line' | 'call' | 'return';

/** One step of execution. */
export interface Snapshot {
  step: number;
  /** 1-indexed, always within the user's own code. */
  line: number;
  event: TraceEvent;
  /** Stable per invocation — powers the call stack and per-frame diffing. */
  frameId: string;
  /** e.g. "twoSum". */
  frameName: string;
  callDepth: number;
  variables: Record<string, VariableState>;
  dataStructures: DataStructureState[];
  highlights: Highlight[];
  /** print() output emitted on this step, when there was any. */
  stdout?: string;
}

export interface VariableState {
  value: unknown;
  /** Python type name: "int", "list", "dict", "TreeNode", "ListNode", … */
  type: string;
  /** Did this variable change on this step? */
  changed: boolean;
}

export type StructureKind =
  | 'array'
  | 'string'
  | 'matrix'
  | 'hashmap'
  | 'set'
  | 'linked_list'
  | 'tree'
  | 'stack'
  | 'queue'
  | 'heap'
  | 'graph';

export interface DataStructureState {
  /** Variable name. */
  id: string;
  type: StructureKind;
  /** Structure-specific payload. */
  data: unknown;
  /** Index pointers, for the sequence-shaped kinds. */
  pointers: Pointer[];
  /** Node pointers, for linked lists and trees. */
  nodePointers?: NodePointer[];
}

export interface Pointer {
  name: string;
  index: number;
  /** Set for matrix pointers; `index` then addresses the flattened cell. */
  cell?: { row: number; col: number };
  color: string;
}

export interface NodePointer {
  name: string;
  /** Index into the serialized node order. */
  nodeIndex: number;
  color: string;
}

export interface Highlight {
  structureId: string;
  indices: number[];
  type: 'compare' | 'swap' | 'visit' | 'current' | 'result';
}

export interface DetectedPattern {
  /** "two_pointer", "sliding_window", "bfs", … */
  type: string;
  /** 0.0 – 1.0 */
  confidence: number;
  description: string;
}

/** Why a trace stopped early, when it did. */
export type TraceLimit = 'events' | 'snapshots' | 'time';

export interface TraceResult {
  snapshots: Snapshot[];
  pattern?: DetectedPattern;
  /** True when a budget cut the run short; `limit` says which one. */
  truncated?: boolean;
  limit?: TraceLimit;
  /** The solution's return value, decoded back to its LeetCode encoding. */
  returnValue?: unknown;
}

export interface ExecutionError {
  error: string;
  /** 1-indexed line in the user's code, when the failure has one. */
  line?: number;
}

// ---------------------------------------------------------------------------
// Code extraction
// ---------------------------------------------------------------------------

export interface ExtractedCode {
  code: string;
  language: string;
  /** Example input strings scraped from the problem description. */
  examples: string[];
}

/** Reply to EXTRACT_CODE. `payload` is always present, even on failure. */
export interface ExtractCodeResponse {
  ok: boolean;
  payload: ExtractedCode;
  error?: string;
}

// ---------------------------------------------------------------------------
// Editor mirroring
// ---------------------------------------------------------------------------

export interface GutterAnnotation {
  variable: string;
  value: string;
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Messages the panel or content script sends to the background worker. */
export type Message =
  | { type: 'EXTRACT_CODE' }
  | { type: 'EXECUTE_CODE'; payload: { code: string; examples: string[] } }
  | { type: 'OPEN_PANEL' }
  | { type: 'EXECUTION_RESULT'; payload: TraceResult }
  | { type: 'EXECUTION_ERROR'; payload: ExecutionError }
  | { type: 'PYODIDE_READY' }
  | { type: 'PYODIDE_LOADING'; payload: { progress: number } }
  /** Panel → content script, via chrome.tabs.sendMessage. */
  | { type: 'UPDATE_GUTTER'; payload: { line: number; annotations: GutterAnnotation[] } }
  | { type: 'CLEAR_GUTTER' };

/** Envelope for messages routed through the SW to the offscreen document. */
export interface OffscreenMessage {
  target: 'offscreen';
  type: 'EXECUTE_CODE';
  payload: { code: string; examples: string[] };
}

/** What the offscreen document replies with, and what the panel receives. */
export type ExecutionResponse =
  | { type: 'EXECUTION_RESULT'; payload: TraceResult }
  | { type: 'EXECUTION_ERROR'; payload: ExecutionError };

// ---------------------------------------------------------------------------
// Offscreen document ↔ Pyodide worker (structured clone, not chrome.runtime)
// ---------------------------------------------------------------------------

export type WorkerRequest =
  | { type: 'INIT'; requestId: number; indexURL: string; interruptBuffer?: Uint8Array }
  | { type: 'EXECUTE'; requestId: number; code: string; examples: string[] };

export type WorkerResponse =
  | { type: 'READY'; requestId: number }
  | { type: 'PROGRESS'; progress: number }
  | { type: 'RESULT'; requestId: number; payload: TraceResult }
  | { type: 'ERROR'; requestId: number; payload: ExecutionError };

export type ExecutionStatus =
  | 'idle'
  | 'loading'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error';
