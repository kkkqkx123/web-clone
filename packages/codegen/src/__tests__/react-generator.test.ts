/**
 * Unit tests for React code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@web-clone/types';
import { ReactGenerator } from '../react-generator.js';

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

describe('ReactGenerator', () => {
  describe('generate', () => {
    it('should generate valid React component', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('tsx');
      expect(result.code).toContain('export default function Counter()');
      expect(result.code).toContain('return (');
    });

    it('should map state to useState<T>()', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('const [count, setCount] = useState<number>(0)');
      expect(result.code).toContain('import { useState } from');
    });

    it('should transform data-binding to {variable}', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('{count}');
      expect(result.code).not.toContain('data-binding');
    });

    it('should transform data-event to onClick handler', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('onClick={increment}');
      expect(result.code).toContain('onClick={decrement}');
      expect(result.code).not.toContain('data-event');
    });

    it('should convert HTML class to className', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('className=');
      // Should not have bare class= attribute
      expect(result.code.match(/\sclass=/)).toBeNull();
    });

    it('should generate TypeScript variant', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.language).toBe('tsx');
      expect(result.code).toContain('useState<number>');
    });

    it('should generate JavaScript variant', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: false });

      expect(result.language).toBe('jsx');
      expect(result.code).toContain('useState(0)');
    });
  });

  describe('metadata', () => {
    it('should include component metadata', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.metadata.hasState).toBe(true);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.styleSize).toBeGreaterThan(0);
    });

    it('should track required imports', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.imports.some(i => i.includes('useState'))).toBe(true);
      expect(result.imports.some(i => i.includes('React'))).toBe(true);
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

      const generator = new ReactGenerator();
      const result = generator.generate(noState, { typescript: true });

      expect(result.code).not.toContain('useState');
      expect(result.metadata.hasState).toBe(false);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new ReactGenerator();
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

      const generator = new ReactGenerator();
      const result = generator.generate(noEvents, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.eventCount).toBe(0);
    });
  });

  describe('CSS handling', () => {
    it('should handle inline styles by default', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        cssModules: false,
      });

      expect(result.code).toContain('/* CSS Rules');
    });

    it('should handle CSS Modules when specified', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, {
        typescript: true,
        cssModules: true,
      });

      expect(result.code).toContain('styles.module.css');
    });
  });

  describe('code quality', () => {
    it('should have proper component structure', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('import');
      expect(result.code).toContain('export default function');
      expect(result.code).toContain('return (');
      expect(result.code).toContain(')');
    });

    it('should not have dangling TODOs in JSX', () => {
      const generator = new ReactGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      // TODOs should be in comments/methods, not in JSX markup
      const jsxMatch = result.code.match(/return\s*\([\s\S]*?\)/);
      if (jsxMatch) {
        expect(jsxMatch[0]).not.toMatch(/TODO.*<|>.*TODO/);
      }
    });
  });
});
