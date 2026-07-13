/**
 * Tests for @web-clone/core — query engine (query-engine.ts)
 */
import { describe, it, expect } from 'vitest';
import { runQuery, typeOf, toTsv, emitQueryResult } from '../../query/query-engine.js';

describe('typeOf', () => {
  it('returns "null" for null', () => expect(typeOf(null)).toBe('null'));
  it('returns "array" for arrays', () => expect(typeOf([1, 2])).toBe('array'));
  it('returns typeof for others', () => {
    expect(typeOf(42)).toBe('number');
    expect(typeOf('hello')).toBe('string');
    expect(typeOf({})).toBe('object');
    expect(typeOf(true)).toBe('boolean');
  });
});

describe('runQuery', () => {
  const data = { items: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };

  it('returns the root with "." path', () => {
    expect(runQuery(data, '.')).toEqual(data);
  });

  it('returns the root with empty path', () => {
    expect(runQuery(data, '')).toEqual(data);
  });

  it('accesses a key with dot notation', () => {
    expect(runQuery(data, '.items')).toEqual(data.items);
  });

  it('iterates with []', () => {
    expect(runQuery(data, '.items[].name')).toEqual(['a', 'b']);
  });

  it('indexes with [n]', () => {
    expect(runQuery(data, '.items[0]')).toEqual(data.items[0]);
  });

  it('supports bracket key access ["key"]', () => {
    expect(runQuery(data, '.items[0]["name"]')).toBe('a');
  });

  it('returns null for missing keys', () => {
    expect(runQuery(data, '.items[0].missing')).toBeNull();
  });
});

describe('toTsv', () => {
  it('returns empty array for empty input', () => {
    expect(toTsv([])).toEqual([]);
  });

  it('produces header + rows for object arrays', () => {
    const result = toTsv([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
    expect(result[0]).toBe('name\tage');
    expect(result[1]).toBe('Alice\t30');
    expect(result[2]).toBe('Bob\t25');
  });

  it('handles scalar values', () => {
    const result = toTsv(['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('escapes tabs and newlines', () => {
    const result = toTsv([{ text: 'a\tb\nc' }]);
    expect(result[1]).toBe('a b c');
  });

  it('handles null values as empty cells', () => {
    const result = toTsv([{ a: null, b: 'value' }]);
    expect(result[1]).toBe('\tvalue');
  });
});

describe('emitQueryResult', () => {
  const data = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
    { name: 'Charlie', age: 35 },
    { name: 'Diana', age: 28 },
  ];

  it('defaults to JSON output', () => {
    const result = emitQueryResult(data, {});
    expect(result.output).toContain('"name"');
    expect(result.output).toContain('Alice');
  });

  it('filters with --where', () => {
    const result = emitQueryResult(data, { where: 'age >= 30' });
    expect(result.output).toContain('Alice');
    expect(result.output).toContain('Charlie');
    expect(result.output).not.toContain('Bob');
  });

  it('produces TSV with --tsv', () => {
    const result = emitQueryResult(data, { tsv: true });
    const lines = result.output.split('\n');
    expect(lines[0]).toBe('name\tage');
    expect(lines[1]).toBe('Alice\t30');
  });

  it('reports --where mismatch', () => {
    const result = emitQueryResult(data, { where: 'age > 200' });
    expect(result.notes[0]).toContain('0 of');
    expect(result.notes[0]).toContain('matched --where');
  });

  it('returns length with --len', () => {
    const result = emitQueryResult(data, { len: true });
    expect(result.output).toBe('4');
  });

  it('picks fields with --pick', () => {
    const result = emitQueryResult(data, { pick: 'name' });
    const parsed = JSON.parse(result.output);
    expect(parsed).toEqual(['Alice', 'Bob', 'Charlie', 'Diana']);
  });

  it('returns keys with --keys', () => {
    const result = emitQueryResult(data, { keys: true });
    expect(result.output).toBe('0\n1\n2\n3');
  });

  it('returns raw with --raw', () => {
    const result = emitQueryResult(data, { raw: true });
    const lines = result.output.split('\n');
    expect(lines).toHaveLength(4);
  });

  it('produces freq table with --freq', () => {
    const freqData = [{ v: 'a' }, { v: 'b' }, { v: 'a' }];
    const result = emitQueryResult(freqData, { freq: true });
    expect(result.output).toContain('a');
    expect(result.output).toContain('b');
  });

  it('limits output with limit option', () => {
    const result = emitQueryResult(data, { limit: 2 });
    const parsed = JSON.parse(result.output);
    expect(parsed.length).toBe(2);
  });
});
