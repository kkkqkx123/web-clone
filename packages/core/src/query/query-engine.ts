/**
 * @web-clone/core — Structured data query engine (jq-subset path language)
 *
 * Ported from ax's query.ts. Provides jq-compatible path queries,
 * type inference, TSV serialization, and a unified emit flow.
 */

import { compileWhere, QueryError } from './expr.js';
import { emitLines, emitJson, type EmitOptions } from '../output/emit.js';

type Step =
  | { kind: 'key'; name: string }
  | { kind: 'iter' }
  | { kind: 'index'; i: number };

function parsePath(path: string): Step[] {
  // jq-compat: `.[0]` / `.["k"]` / `.[]` are the same as `[0]` / `["k"]` / `[]`.
  path = path.replace(/\.(?=\[)/g, '');
  if (path === '' || path === '.') return [];
  const steps: Step[] = [];
  const re = /\.([A-Za-z_$][\w$-]*)|\["([^"]+)"\]|\[(\d+)\]|\[\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m.index !== last) throw new QueryError(`cannot parse path near: ${path.slice(last)}`);
    if (m[1] !== undefined) steps.push({ kind: 'key', name: m[1] });
    else if (m[2] !== undefined) steps.push({ kind: 'key', name: m[2] });
    else if (m[3] !== undefined) steps.push({ kind: 'index', i: Number(m[3]) });
    else steps.push({ kind: 'iter' });
    last = re.lastIndex;
  }
  if (last !== path.length) throw new QueryError(`cannot parse path near: ${path.slice(last)}`);
  return steps;
}

/**
 * Get the type name of a value (null, array, or typeof).
 */
export function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function apply(stream: unknown[], step: Step): unknown[] {
  const out: unknown[] = [];
  for (const v of stream) {
    if (step.kind === 'key') {
      if (typeOf(v) !== 'object') throw new QueryError(`cannot index ${typeOf(v)} with "${step.name}"`);
      out.push((v as Record<string, unknown>)[step.name] ?? null);
    } else if (step.kind === 'index') {
      if (!Array.isArray(v)) throw new QueryError(`cannot index ${typeOf(v)} with [${step.i}]`);
      out.push(v[step.i] ?? null);
    } else {
      if (Array.isArray(v)) out.push(...v);
      else if (typeOf(v) === 'object') out.push(...Object.values(v as object));
      else throw new QueryError(`cannot iterate ${typeOf(v)} with []`);
    }
  }
  return out;
}

/**
 * Run a jq-subset path query on a root value.
 *
 * @param root - The root data structure to query.
 * @param path - The jq path (e.g., ".items[0].name", "[].id"). Defaults to "." (identity).
 * @returns The queried value — a single scalar for one result, an array for many.
 */
export function runQuery(root: unknown, path: string | undefined): unknown {
  let stream: unknown[] = [root];
  for (const step of parsePath(path ?? '.')) stream = apply(stream, step);
  return stream.length === 1 ? stream[0] : stream;
}

// Project each row down to the picked fields (--pick 'a,b,c').
// Fields may be dot paths: --pick 'customer.country,total'.
function pick(result: unknown, spec: string): unknown {
  const fields = spec
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  const dig = (row: unknown, path: string): unknown => {
    let v: unknown = row;
    for (const key of path.split('.')) {
      if (v === null || typeof v !== 'object') return null;
      v = (v as Record<string, unknown>)[key] ?? null;
    }
    return v;
  };
  const project = (row: unknown) => {
    if (typeOf(row) !== 'object') return row;
    if (fields.length === 1) return dig(row, fields[0]!);
    return Object.fromEntries(fields.map((f) => [f, dig(row, f)]));
  };
  return Array.isArray(result) ? result.map(project) : project(result);
}

/**
 * Convert a result to TSV lines.
 * For uniform objects: keys as header once, values per line.
 * For scalar/array results: one value per line.
 */
export function toTsv(result: unknown): string[] {
  const arr = Array.isArray(result) ? result : [result];
  if (arr.length === 0) return [];
  const cell = (v: unknown) =>
    v === null || v === undefined
      ? ''
      : typeOf(v) === 'object' || Array.isArray(v)
        ? JSON.stringify(v)
        : String(v).replace(/[\t\n]/g, ' ');
  if (typeOf(arr[0]) !== 'object') return arr.map(cell);
  const headers = Object.keys(arr[0] as object);
  return [
    headers.join('\t'),
    ...arr.map((row) => headers.map((h) => cell((row as Record<string, unknown>)[h])).join('\t')),
  ];
}

/**
 * Options for `emitQueryResult`.
 */
export interface QueryEmitOptions {
  shape?: boolean;
  where?: string;
  pick?: string;
  freq?: boolean;
  tsv?: boolean;
  keys?: boolean;
  len?: boolean;
  raw?: boolean;
}

/**
 * Unified query result formatting with support for --where filtering,
 * --pick field projection, --freq frequency tables, --tsv, --json, etc.
 *
 * Returns an object with `output` (formatted string) and `notes` (informational messages).
 * Unlike ax's version, this does NOT write to stdout/stderr — it returns data.
 */
export function emitQueryResult(
  result: unknown,
  flags: QueryEmitOptions & EmitOptions,
): { output: string; notes: string[] } {
  const opts: EmitOptions = {
    limit: flags.limit ?? 50,
    all: flags.all ?? false,
    budget: flags.budget ?? 0,
  };
  const notes: string[] = [];

  // --where filtering
  if (typeof flags.where === 'string') {
    if (!Array.isArray(result)) throw new QueryError('--where needs an array result (iterate with [] first)');
    const rows = result as unknown[];
    const filtered = rows.filter(compileWhere(flags.where!));
    if (rows.length > 0 && filtered.length === 0) {
      notes.push('0 of ' + rows.length + ' rows matched --where (if comparing to a string, quote it: --where "plan == \'pro\'")');
    }
    result = filtered;
  }

  // --pick field projection
  if (typeof flags.pick === 'string') result = pick(result, flags.pick);

  // --freq: frequency table
  if (flags.freq) {
    const arr = Array.isArray(result) ? result : [result];
    const counts = new Map<string, number>();
    for (const v of arr) {
      const key = typeOf(v) === 'object' || Array.isArray(v) ? JSON.stringify(v) : String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const lines = [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([v, n]) => `${String(n).padStart(7)}  ${v}`);
    const emitResult = emitLines(lines, opts);
    notes.push(...emitResult.notes);
    return { output: emitResult.lines.join('\n'), notes };
  }

  // --tsv
  if (flags.tsv) {
    const emitResult = emitLines(toTsv(result), opts);
    notes.push(...emitResult.notes);
    return { output: emitResult.lines.join('\n'), notes };
  }

  // --keys
  if (flags.keys) {
    const keys = Array.isArray(result)
      ? result.map((_, i) => String(i))
      : typeOf(result) === 'object'
        ? Object.keys(result as object)
        : (() => { throw new QueryError('cannot list keys of ' + typeOf(result)); })();
    const emitResult = emitLines(keys, opts);
    notes.push(...emitResult.notes);
    return { output: emitResult.lines.join('\n'), notes };
  }

  // --len
  if (flags.len) {
    const len = Array.isArray(result)
      ? result.length
      : typeOf(result) === 'object'
        ? Object.keys(result as object).length
        : typeof result === 'string'
          ? result.length
          : (() => { throw new QueryError('cannot take length of ' + typeOf(result)); })();
    return { output: String(len), notes };
  }

  // --raw
  if (flags.raw) {
    const arr = Array.isArray(result) ? result : [result];
    const lines = arr.map((v) =>
      typeOf(v) === 'object' || Array.isArray(v) ? JSON.stringify(v) : String(v),
    );
    const emitResult = emitLines(lines, opts);
    notes.push(...emitResult.notes);
    return { output: emitResult.lines.join('\n'), notes };
  }

  // Default: JSON
  const emitResult = emitJson(result, opts);
  notes.push(...emitResult.notes);
  return { output: emitResult.lines.join('\n'), notes };
}
