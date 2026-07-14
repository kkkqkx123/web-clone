/**
 * Unit tests for Angular code generator
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@web-clone/types';
import { AngularGenerator } from '../angular-generator.js';

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

describe('AngularGenerator', () => {
  describe('generate', () => {
    it('should generate valid Angular component', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.name).toBe('Counter');
      expect(result.language).toBe('ts');
      expect(result.code).toContain('@Component');
      expect(result.code).toContain('export class CounterComponent');
    });

    it('should map state to class properties', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('count: number = 0');
    });

    it('should transform data-binding to {{ variable }}', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('{{ count }}');
      expect(result.code).not.toContain('data-binding');
    });

    it('should transform data-event to (click)="handler()"', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('(click)="increment()"');
      expect(result.code).toContain('(click)="decrement()"');
      expect(result.code).not.toContain('data-event');
    });

    it('should generate Angular imports', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain("import { Component } from '@angular/core'");
      expect(result.code).toContain("import { CommonModule } from '@angular/common'");
    });
  });

  describe('component structure', () => {
    it('should have standalone: true flag', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('standalone: true');
    });

    it('should wrap CSS in styles array', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.code).toContain('styles: [');
      expect(result.code).toContain('.counter');
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

      const generator = new AngularGenerator();
      const result = generator.generate(noState, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.hasState).toBe(false);
    });

    it('should handle component with empty styles', () => {
      const noStyles: ComponentSpec = {
        ...mockComponent,
        styles: '',
      };

      const generator = new AngularGenerator();
      const result = generator.generate(noStyles, { typescript: true });

      expect(result.code).toBeTruthy();
    });

    it('should handle component without events', () => {
      const noEvents: ComponentSpec = {
        ...mockComponent,
        logic: {
          state: mockComponent.logic.state,
          methods: mockComponent.logic.methods,
          events: [],
        },
      };

      const generator = new AngularGenerator();
      const result = generator.generate(noEvents, { typescript: true });

      expect(result.code).toBeTruthy();
      expect(result.metadata.eventCount).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should include component metadata', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.metadata.hasState).toBe(true);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.styleSize).toBeGreaterThan(0);
    });

    it('should track required imports', () => {
      const generator = new AngularGenerator();
      const result = generator.generate(mockComponent, { typescript: true });

      expect(result.imports.some(i => i.includes('Component'))).toBe(true);
      expect(result.imports.some(i => i.includes('CommonModule'))).toBe(true);
    });
  });
});
