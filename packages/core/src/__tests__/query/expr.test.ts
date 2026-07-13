/**
 * Tests for @web-clone/core — safe expression language (expr.ts)
 */
import { describe, it, expect } from 'vitest';
import { compileWhere, QueryError } from '../../query/expr.js';

describe('compileWhere', () => {
  it('compares numbers with >, >=, <, <=', () => {
    const pred = compileWhere('price > 100');
    expect(pred({ price: 150 })).toBe(true);
    expect(pred({ price: 50 })).toBe(false);
    expect(pred({ price: 100 })).toBe(false);
  });

  it('compares with >=', () => {
    const pred = compileWhere('price >= 100');
    expect(pred({ price: 100 })).toBe(true);
    expect(pred({ price: 99 })).toBe(false);
  });

  it('compares with <=', () => {
    const pred = compileWhere('price <= 100');
    expect(pred({ price: 100 })).toBe(true);
    expect(pred({ price: 101 })).toBe(false);
  });

  it('compares strings with ==', () => {
    const pred = compileWhere('name == "Alice"');
    expect(pred({ name: 'Alice' })).toBe(true);
    expect(pred({ name: 'Bob' })).toBe(false);
  });

  it('compares strings with !=', () => {
    const pred = compileWhere('name != "Alice"');
    expect(pred({ name: 'Bob' })).toBe(true);
    expect(pred({ name: 'Alice' })).toBe(false);
  });

  it('supports && (and)', () => {
    const pred = compileWhere('price > 50 && stock != 0');
    expect(pred({ price: 100, stock: 5 })).toBe(true);
    expect(pred({ price: 30, stock: 5 })).toBe(false);
    expect(pred({ price: 100, stock: 0 })).toBe(false);
  });

  it('supports || (or)', () => {
    const pred = compileWhere('price > 100 || featured == true');
    expect(pred({ price: 50, featured: true })).toBe(true);
    expect(pred({ price: 50, featured: false })).toBe(false);
  });

  it('supports ! (not)', () => {
    const pred = compileWhere('!archived');
    expect(pred({ archived: false })).toBe(true);
    expect(pred({ archived: true })).toBe(false);
  });

  it('supports regex ~', () => {
    const pred = compileWhere('name ~ /^Lesson/');
    expect(pred({ name: 'Lesson 1' })).toBe(true);
    expect(pred({ name: 'Chapter 1' })).toBe(false);
  });

  it('supports regex !~', () => {
    const pred = compileWhere('name !~ /\\d+/');
    expect(pred({ name: 'Hello' })).toBe(true);
    expect(pred({ name: 'Hello 123' })).toBe(false);
  });

  it('supports regex flags', () => {
    const pred = compileWhere('name ~ /hello/i');
    expect(pred({ name: 'HELLO World' })).toBe(true);
    expect(pred({ name: 'world' })).toBe(false);
  });

  it('supports dot path access', () => {
    const pred = compileWhere('item.price > 100');
    expect(pred({ item: { price: 150 } })).toBe(true);
    expect(pred({ item: { price: 50 } })).toBe(false);
  });

  it('supports .length on arrays', () => {
    const pred = compileWhere('tags.length >= 2');
    expect(pred({ tags: ['a', 'b'] })).toBe(true);
    expect(pred({ tags: ['a'] })).toBe(false);
  });

  it('supports .length on strings', () => {
    const pred = compileWhere('name.length > 5');
    expect(pred({ name: 'Alexander' })).toBe(true);
    expect(pred({ name: 'Bob' })).toBe(false);
  });

  it('supports backtick-quoted column names', () => {
    const pred = compileWhere('`Stars` >= 100');
    expect(pred({ 'Stars': 500 })).toBe(true);
    expect(pred({ 'Stars': 50 })).toBe(false);
  });

  it('handles true/false/null literals', () => {
    expect(compileWhere('active == true')({ active: true })).toBe(true);
    expect(compileWhere('active == false')({ active: false })).toBe(true);
    expect(compileWhere('value == null')({ value: null })).toBe(true);
  });

  it('numeric-friendly comparison ("25000" > 100)', () => {
    const pred = compileWhere('stars > 100');
    expect(pred({ stars: '25000' })).toBe(true);
    expect(pred({ stars: '50' })).toBe(false);
  });

  it('parenthesised expressions', () => {
    const pred = compileWhere('(price > 100) && (stock > 0)');
    expect(pred({ price: 200, stock: 5 })).toBe(true);
    expect(pred({ price: 200, stock: 0 })).toBe(false);
  });

  it('throws QueryError on bad syntax', () => {
    expect(() => compileWhere('price >')).toThrow(QueryError);
    expect(() => compileWhere('(price > 100')).toThrow(QueryError);
    expect(() => compileWhere('price > 100 ||')).toThrow(QueryError);
  });

  it('throws QueryError on unterminated string', () => {
    expect(() => compileWhere("name == 'hello")).toThrow(QueryError);
  });

  it('throws QueryError on unterminated regex', () => {
    expect(() => compileWhere('name ~ /hello')).toThrow(QueryError);
  });
});
