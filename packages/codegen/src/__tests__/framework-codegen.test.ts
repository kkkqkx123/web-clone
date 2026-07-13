/**
 * Unit tests for Vue code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@web-clone/core';
import { VueGenerator } from '../vue-generator.js';

// Mock component for testing
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

describe('VueGenerator', () => {
  describe('generate', () => {
    it('should generate valid Vue SFC', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('vue');
      expect(result.code).toContain('<template>');
      expect(result.code).toContain('<script setup lang="ts">');
      expect(result.code).toContain('<style scoped>');
    });

    it('should map state to ref<T>()', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('const count = ref<number>(0)');
      expect(result.code).toContain('import { ref } from');
    });

    it('should transform data-binding to {{ variable }}', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('{{ count }}');
      expect(result.code).not.toContain('data-binding');
    });

    it('should transform data-event to @event="handler"', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('@click="increment"');
      expect(result.code).toContain('@click="decrement"');
      expect(result.code).not.toContain('data-event');
    });

    it('should wrap CSS in <style scoped>', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('<style scoped>');
      expect(result.code).toContain('.counter { padding: 1rem; }');
    });

    it('should have proper component structure', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      const lines = result.code.split('\n');
      expect(lines[0]).toContain('<template>');
      expect(result.code).toContain('<script setup lang="ts">');
      expect(result.code).toContain('<style scoped>');
    });
  });

  describe('metadata', () => {
    it('should include component metadata', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.metadata.hasState).toBe(true);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.styleSize).toBeGreaterThan(0);
    });

    it('should track dependencies', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.dependencies).toContain('vue');
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

      const generator = new VueGenerator();
      const result = generator.generate(noState, { typescript: true });

      expect(result.code).not.toContain('ref(');
      expect(result.metadata.hasState).toBe(false);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new VueGenerator();
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

      const generator = new VueGenerator();
      const result = generator.generate(noEvents, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.eventCount).toBe(0);
    });
  });
});
