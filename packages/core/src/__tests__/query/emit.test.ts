/**
 * Tests for @web-clone/core — output formatting (emit.ts)
 */
import { describe, it, expect } from 'vitest';
import { sanitizeLine, emitLines, emitJson } from '../../output/emit.js';

describe('sanitizeLine', () => {
  it('passes through clean text', () => {
    const { text, removed } = sanitizeLine('Hello, world!');
    expect(text).toBe('Hello, world!');
    expect(removed).toBe(0);
  });

  it('strips ANSI escape sequences', () => {
    const { text, removed } = sanitizeLine('\x1b[31mRed\x1b[0m');
    expect(text).toBe('Red');
    expect(removed).toBeGreaterThanOrEqual(7);
  });

  it('strips OSC sequences', () => {
    const { text, removed } = sanitizeLine('\x1b]0;title\x07hello');
    expect(text).toBe('hello');
    expect(removed).toBeGreaterThanOrEqual(9);
  });

  it('strips control characters', () => {
    const { text, removed } = sanitizeLine('line\x00with\x1Fnull');
    expect(text).toBe('linewithnull');
    expect(removed).toBe(2);
  });
});

describe('emitLines', () => {
  it('returns all lines when under limit', () => {
    const result = emitLines(['a', 'b', 'c']);
    expect(result.lines).toEqual(['a', 'b', 'c']);
    expect(result.notes).toEqual([]);
  });

  it('caps at default limit of 50', () => {
    const items = Array.from({ length: 100 }, (_, i) => `item ${i}`);
    const result = emitLines(items);
    expect(result.lines.length).toBe(50);
    expect(result.notes[0]).toContain('more result(s) hidden');
  });

  it('respects custom limit', () => {
    const items = Array.from({ length: 100 }, (_, i) => `item ${i}`);
    const result = emitLines(items, { limit: 10 });
    expect(result.lines.length).toBe(10);
    expect(result.notes[0]).toContain('90 more');
  });

  it('shows all with all: true', () => {
    const items = Array.from({ length: 100 }, (_, i) => `item ${i}`);
    const result = emitLines(items, { all: true });
    expect(result.lines.length).toBe(100);
    expect(result.notes).toEqual([]);
  });

  it('respects budget (token limit)', () => {
    const items = ['short', 'very long string here'];
    const result = emitLines(items, { all: true, budget: 2 }); // ~8 chars
    // The first line "short\n" is 6 chars, < 8, so should fit
    expect(result.lines.length).toBe(1);
  });

  it('sanitizes lines and reports removed chars', () => {
    const result = emitLines(['\x1b[31mred\x1b[0m'], { all: true });
    expect(result.lines[0]).toBe('red');
    expect(result.notes[0]).toContain('stripped');
  });
});

describe('emitJson', () => {
  it('formats a non-array value as JSON', () => {
    const result = emitJson({ name: 'test', value: 42 });
    expect(result.lines[0]).toContain('"name"');
    expect(result.lines[0]).toContain('"test"');
    expect(result.notes).toEqual([]);
  });

  it('caps array items with limit', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const result = emitJson(items, { limit: 5 });
    const parsed = JSON.parse(result.lines[0]);
    expect(parsed.length).toBe(5);
    expect(result.notes[0]).toContain('95 more');
  });

  it('shows all array items with all: true', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const result = emitJson(items, { all: true });
    const parsed = JSON.parse(result.lines[0]);
    expect(parsed.length).toBe(10);
  });
});
