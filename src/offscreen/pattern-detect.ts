/**
 * Regex-based algorithm-pattern heuristics.
 *
 * Known to misfire (bug B11) — DESIGN.md §7 replaces this wholesale with an
 * AST scorer in milestone M6. Moved here unchanged so the M1 worker split
 * stays a pure refactor.
 */

import type { DetectedPattern } from '../shared/types';

export function detectPattern(code: string): DetectedPattern | undefined {
  const lines = code.split('\n');
  const full = code;

  if (
    /while\s+\w*lo\w*\s*<=?\s*\w*hi\w*/i.test(full) ||
    /while\s+\w*left\w*\s*<=?\s*\w*right\w*/i.test(full) ||
    (/\bmid\b/.test(full) && /\blo\b|\bleft\b/.test(full) && /\bhi\b|\bright\b/.test(full))
  ) {
    return {
      type: 'binary_search',
      confidence: 0.85,
      description:
        'Binary search: repeatedly halves the search space using two boundary pointers and a midpoint.',
    };
  }

  if (/\bdeque\b|\bqueue\b/i.test(full) && /\bappend\b|\bpopleft\b|\bappendleft\b/i.test(full)) {
    return {
      type: 'bfs',
      confidence: 0.85,
      description: 'Breadth-first search: explores nodes level by level using a queue.',
    };
  }

  const hasRecursion = lines.some((l) => {
    const fnMatch = l.match(/def\s+(\w+)\s*\(/);
    if (fnMatch) {
      return new RegExp(`\\b${fnMatch[1]}\\s*\\(`).test(
        lines.slice(lines.indexOf(l) + 1).join('\n'),
      );
    }
    return false;
  });
  if (hasRecursion && /\bvisited\b/i.test(full)) {
    return {
      type: 'dfs',
      confidence: 0.8,
      description:
        'Depth-first search: explores paths recursively, using a visited set to avoid revisiting nodes.',
    };
  }

  if (
    hasRecursion &&
    /\bappend\b/.test(full) &&
    /\bpop\b/.test(full) &&
    /result|res|ans/i.test(full)
  ) {
    return {
      type: 'backtracking',
      confidence: 0.75,
      description:
        'Backtracking: recursively builds candidates and abandons those that fail the constraints.',
    };
  }

  if (/@cache|@lru_cache/i.test(full) || /\[0\]\s*\*/.test(full) || /dp\s*=\s*\[/.test(full)) {
    return {
      type: 'dynamic_programming',
      confidence: 0.8,
      description:
        'Dynamic programming: breaks the problem into overlapping subproblems and memoizes results.',
    };
  }

  {
    const twoPointerPatterns = [
      /while\s+\w*left\w*\s*<\s*\w*right\w*/i,
      /while\s+\w*lo\w*\s*<\s*\w*hi\w*/i,
      /\bleft\s*\+=\s*1\b.*\bright\s*-=\s*1\b/is,
    ];
    if (twoPointerPatterns.some((p) => p.test(full))) {
      return {
        type: 'two_pointer',
        confidence: 0.8,
        description:
          'Two pointer: uses two indices moving toward each other to efficiently process sorted data.',
      };
    }
  }

  return undefined;
}
