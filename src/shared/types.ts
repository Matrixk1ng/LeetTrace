// One step of execution
interface Snapshot {
  step: number;
  line: number;
  variables: Record<string, VariableState>;
  dataStructures: DataStructureState[];
  highlights: Highlight[];
}

interface VariableState {
  value: any;
  type: string;       // "int", "list", "dict", "TreeNode", "ListNode", etc.
  changed: boolean;    // Did this variable change on this step?
}

interface DataStructureState {
  id: string;          // Variable name
  type: "array" | "linked_list" | "tree" | "hashmap" | "matrix";
  data: any;           // Structure-specific data
  pointers: Pointer[]; // Named index pointers (i, j, left, right, etc.)
}

interface Pointer {
  name: string;
  index: number;
  color: string;
}

interface Highlight {
  structureId: string;
  indices: number[];
  type: "compare" | "swap" | "visit" | "current" | "result";
}

// All message types between content script, panel, and background
// @ts-ignore
type Message =
  | { type: "EXTRACT_CODE" }
  | { type: "CODE_EXTRACTED"; payload: { code: string; language: string } }
  | { type: "EXECUTE_CODE"; payload: { code: string } }
  | { type: "EXECUTION_RESULT"; payload: { snapshots: Snapshot[]; pattern?: DetectedPattern } }
  | { type: "EXECUTION_ERROR"; payload: { error: string; line?: number } }
  | { type: "UPDATE_GUTTER"; payload: { line: number; annotations: GutterAnnotation[] } }
  | { type: "CLEAR_GUTTER" }
  | { type: "OPEN_PANEL" }
  | { type: "PYODIDE_READY" }
  | { type: "PYODIDE_LOADING"; payload: { progress: number } };

interface GutterAnnotation {
  variable: string;
  value: string;
  changed: boolean;
}
// @ts-ignore
type ExecutionStatus = "idle" | "loading" | "running" | "paused" | "completed" | "error";

interface DetectedPattern {
  type: string;        // "two_pointer", "sliding_window", "bfs", etc.
  confidence: number;  // 0.0 - 1.0
  description: string;
}