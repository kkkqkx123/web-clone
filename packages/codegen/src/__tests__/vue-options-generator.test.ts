/**
 * Unit tests for Vue Options API code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@web-clone/types';
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
      {
        name: 'mounted',
        kind: 'lifecycle',
        code: 'console.log("mounted")',
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

describe('VueGenerator (Options API)', () => {
  describe('generate with vueApi: options', () => {
    it('should generate valid Vue Options API component', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('vue');
      expect(result.code).toContain('<template>');
      expect(result.code).toContain('<script lang="ts">');
      expect(result.code).not.toContain('<script setup');
      expect(result.code).toContain('<style scoped>');
    });

    it('should generate data() return with state properties', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('data()');
      expect(result.code).toContain('count: 0');
    });

    it('should generate methods block', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('methods:');
      expect(result.code).toContain('increment()');
      expect(result.code).toContain('decrement()');
    });

    it('should generate lifecycle hooks in component options', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('mounted()');
    });

    it('should transform data-binding to {{ variable }}', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('{{ count }}');
      expect(result.code).not.toContain('data-binding');
    });

    it('should transform data-event to @event="handler"', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('@click="increment"');
      expect(result.code).toContain('@click="decrement"');
      expect(result.code).not.toContain('data-event');
    });

    it('should wrap CSS in <style scoped>', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('<style scoped>');
      expect(result.code).toContain('.counter { padding: 1rem; }');
    });

    it('should not import ref or lifecycle hooks', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.imports).toEqual([]);
    });
  });

  describe('default (Composition API) unchanged', () => {
    it('should still generate Composition API by default', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('<script setup');
      expect(result.code).toContain('const count = ref<number>');
    });

    it('should still import ref for Composition API', () => {
      const generator = new VueGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.imports).toContain('ref');
      expect(result.imports).toContain('onMounted');
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
      const result = generator.generate(noState, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toContain('export default');
      expect(result.code).not.toContain('data()');
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
      const result = generator.generate(noEvents, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toBeTruthy();
      expect(result.metadata.eventCount).toBe(0);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new VueGenerator();
      const result = generator.generate(noStyles, {
        typescript: true,
        vueApi: 'options',
      });

      expect(result.code).toBeTruthy();
    });
  });
});