/**
 * Unit tests for jQuery code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@web-clone/core';
import { JQueryGenerator } from '../jquery-generator.js';

const mockComponent: ComponentSpec = {
  name: 'Counter',
  type: 'stateful',
  children: [],
  template: `<div class="counter">
    <span data-binding="count">0</span>
    <button data-event="click:increment">+</button>
    <button data-event="click:decrement">-</button>
  </div>`,
  styles: `.counter { padding: 1rem; }
.counter span { font-size: 1.5rem; font-weight: bold; }`,
  manifest: {
    name: 'Counter',
    type: 'stateful',
    path: 'components/Counter',
    children: [],
    state: {},
    events: {},
    migration: {
      effort: '1h',
      effortBreakdown: { extraction: '10m', conversion: '30m' },
      suggestions: [],
      
    },
  },
  logic: {
    state: [
      {
        name: 'count',
        type: 'number',
        initial: 0,
        bindings: ['.counter span'],
        mutators: ['increment', 'decrement'],
        confidence: 0.95,
      },
    ],
    methods: [
      {
        name: 'increment',
        kind: 'handler',
        code: 'count++',
        parameters: [],
        sideEffects: [],
      },
      {
        name: 'decrement',
        kind: 'handler',
        code: 'count--',
        parameters: [],
        sideEffects: [],
      },
    ],
    events: [
      {
        selector: 'button:first',
        event: 'click',
        handler: 'increment',
      },
      {
        selector: 'button:last',
        event: 'click',
        handler: 'decrement',
      },
    ],
    
  },
};

describe('JQueryGenerator', () => {
  describe('generate', () => {
    it('should generate valid jQuery component class', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('ts');
      expect(result.code).toContain('export class Counter');
      expect(result.code).toContain('constructor(selector: string)');
    });

    it('should map state to private class properties', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('private count: number = 0');
    });

    it('should generate jQuery imports', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain("import $ from 'jquery'");
      expect(result.code).toContain("import type { JQuery } from 'jquery'");
    });

    it('should setup event listeners with .on()', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain(".on('click', () => this.increment())");
      expect(result.code).toContain(".on('click', () => this.decrement())");
    });

    it('should have init and render methods', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('private init()');
      expect(result.code).toContain('private render()');
      expect(result.code).toContain('private setupEventListeners()');
    });
  });

  describe('class structure', () => {
    it('should have $root jQuery element reference', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('private $root: JQuery');
    });

    it('should initialize component in constructor', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('this.$root = $(selector)');
      expect(result.code).toContain('this.init()');
    });
  });

  describe('edge cases', () => {
    it('should handle component without state', () => {
      const noState: ComponentSpec = {
        ...mockComponent,
        type: 'presentational',
        logic: {
          state: [],
          methods: [],
          events: [],
          
        },
      };

      const generator = new JQueryGenerator();
      const result = generator.generate(noState, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.hasState).toBe(false);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new JQueryGenerator();
      const result = generator.generate(noStyles, { typescript: true });

      expect(result.code).toBeTruthy();
    });

    it('should handle component without events', () => {
      const noEvents: ComponentSpec = {
        ...mockComponent,
        logic: {
          ...mockComponent.logic,
          events: [],
        },
      };

      const generator = new JQueryGenerator();
      const result = generator.generate(noEvents, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.code).toContain('// No event listeners configured');
      expect(result.metadata.eventCount).toBe(0);
    });
  });

  describe('JavaScript variant', () => {
    it('should generate .js file when typescript is false', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: false });

      expect(result.language).toBe('js');
    });

    it('should omit type annotations in JavaScript', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: false });

      // TypeScript-specific imports should still be there but less prominent
      expect(result.code).toContain("import $ from 'jquery'");
    });
  });

  describe('metadata', () => {
    it('should include component metadata', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.metadata.hasState).toBe(true);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.styleSize).toBeGreaterThan(0);
    });

    it('should track jQuery dependency', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.imports.some(i => i.includes('jquery'))).toBe(true);
    });
  });

  describe('CSS handling', () => {
    it('should provide guidance for external CSS', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('CSS (include via');
    });

    it('should suggest inline styles option', () => {
      const generator = new JQueryGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('use inline styles');
    });
  });
});
