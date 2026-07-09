/**
 * Unit tests for Svelte code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '../types.js';
import { SvelteGenerator } from '../transform/framework-codegen/svelte-generator.js';

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

describe('SvelteGenerator', () => {
  describe('generate', () => {
    it('should generate valid Svelte component', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('svelte');
      expect(result.code).toContain('<script lang="ts">');
      expect(result.code).toContain('</script>');
      expect(result.code).toContain('<style>');
    });

    it('should map state to let variables', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('let count: number = 0');
    });

    it('should transform data-binding to {variable}', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('{count}');
      expect(result.code).not.toContain('data-binding');
    });

    it('should transform data-event to on:event={handler}', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('on:click={increment}');
      expect(result.code).toContain('on:click={decrement}');
      expect(result.code).not.toContain('data-event');
    });

    it('should wrap CSS in <style> block', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('<style>');
      expect(result.code).toContain('.counter');
      expect(result.code).toContain('</style>');
    });
  });

  describe('reactive variables', () => {
    it('should use reactive let declarations', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('let count: number = 0');
    });

    it('should declare event handlers as functions', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('const increment = ()');
      expect(result.code).toContain('const decrement = ()');
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

      const generator = new SvelteGenerator();
      const result = generator.generate(noState, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.hasState).toBe(false);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new SvelteGenerator();
      const result = generator.generate(noStyles, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.code).not.toContain('<style>');
    });

    it('should handle component without events', () => {
      const noEvents: ComponentSpec = {
        ...mockComponent,
        logic: {
          ...mockComponent.logic,
          events: [],
        },
      };

      const generator = new SvelteGenerator();
      const result = generator.generate(noEvents, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.eventCount).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should include component metadata', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.metadata.hasState).toBe(true);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.styleSize).toBeGreaterThan(0);
    });

    it('should not require explicit imports', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.imports).toEqual([]);
    });
  });

  describe('scoped styles', () => {
    it('should automatically scope styles in Svelte', () => {
      const generator = new SvelteGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      // Svelte automatically scopes styles
      expect(result.code).toContain('<style>');
      expect(result.code).toContain('.counter');
    });
  });
});
