/**
 * @web-clone/core — Output formatting with budget/limit control
 *
 * Ported from ax's emit.ts. Instead of writing to stdout/stderr directly,
 * this library-oriented version returns formatted strings and note arrays
 * so the caller (CLI, API consumer) decides where to send them.
 *
 * Default-cap large results so consumers don't drown in tokens,
 * but NEVER truncate silently — always return notes about what was dropped.
 */

const DEFAULT_LIMIT = 50;
const CHARS_PER_TOKEN = 4;

export type EmitOptions = {
  limit?: number;
  all?: boolean;
  budget?: number;
};

/**
 * Result of a formatted emit operation.
 * `lines` is the output to display; `notes` are informational messages for stderr/log.
 */
export interface EmitResult {
  lines: string[];
  notes: string[];
}

// Whole sequences first (OSC then CSI then two-byte escapes), then stray control bytes.
const OSC_SEQ = new RegExp('\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?', 'g');
const CSI_SEQ = new RegExp('\\x1b\\[[0-9;:?]*[ -/]*[@-~]?', 'g');
const ESC_SEQ = new RegExp('\\x1b.?', 'g');
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\u0080-\\u009F]', 'g');

/**
 * Sanitize a string by stripping ANSI/OSC/CSI escapes and control characters.
 * Returns the cleaned text and the count of removed characters.
 */
export function sanitizeLine(s: string): { text: string; removed: number } {
  const text = s
    .replace(OSC_SEQ, '')
    .replace(CSI_SEQ, '')
    .replace(ESC_SEQ, '')
    .replace(CONTROL_CHARS, '');
  return { text, removed: s.length - text.length };
}

function cap<T>(items: T[], opts: EmitOptions, sizeOf: (item: T) => number) {
  let shown = items;
  if (!opts.all) {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    if (shown.length > limit) shown = shown.slice(0, limit);
  }
  // --budget <tokens>: additionally cut to an estimated token budget.
  if (opts.budget && opts.budget > 0) {
    const maxChars = opts.budget * CHARS_PER_TOKEN;
    let used = 0;
    let i = 0;
    for (; i < shown.length; i++) {
      used += sizeOf(shown[i]!);
      if (used > maxChars && i > 0) break;
    }
    shown = shown.slice(0, i);
  }
  return { shown, dropped: items.length - shown.length };
}

/**
 * Format an array of lines with limit/budget capping and sanitization.
 * Returns an `EmitResult` with the formatted lines and any notes.
 */
export function emitLines(items: string[], opts: EmitOptions = {}): EmitResult {
  const { shown, dropped } = cap(items, opts, (s) => s.length + 1);
  let stripped = 0;
  const safe = shown.map((line) => {
    const { text, removed } = sanitizeLine(line);
    stripped += removed;
    return text;
  });
  const notes: string[] = [];
  if (stripped > 0) {
    notes.push(`stripped ${stripped} control character(s) from output`);
  }
  if (dropped > 0) {
    notes.push(`${dropped} more result(s) hidden (use --all, --limit N, or --budget T)`);
  }
  return { lines: safe, notes };
}

/**
 * Format a JSON-serializable value with limit/budget capping.
 * Returns an `EmitResult` with the JSON string and any notes.
 */
export function emitJson(value: unknown, opts: EmitOptions = {}): EmitResult {
  const notes: string[] = [];
  if (Array.isArray(value)) {
    const { shown, dropped } = cap(value, opts, (v) => JSON.stringify(v).length + 4);
    if (dropped > 0) {
      notes.push(`${dropped} more result(s) hidden (use --all, --limit N, or --budget T)`);
    }
    return { lines: [JSON.stringify(shown, null, 2)], notes };
  }
  return { lines: [JSON.stringify(value, null, 2)], notes };
}
