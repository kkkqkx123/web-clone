/**
 * Integration tests for Phase 2: Angular, Svelte, jQuery support
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '../types.js';
import { FrameworkCodeGenerator } from '../transform/framework-codegen/index.js';

const mockComponent: ComponentSpec = {
  name: 'Button',
  type: 'stateful',
  children: [],
  template: '<button data-binding="label" data-event="click:onClick"></button>',
  styles: '.btn { padding: 8px; }',
  manifest: {
    name: 'Button',
    type: 'stateful',
    path: 'components/Button',
    children: [],
    state: {},
    events: {},
    migration: {
      effort: '1h',
      effortBreakdown: { extraction: '10m', conversion: '20m' },
      suggestions: [],
      
    },
  },
  logic: {
    state: [
      {
        name: 'label',
        type: 'string',
        initial: 'Click me',
        bindings: ['button'],
        mutators: [],
        confidence: 0.9,
      },
    ],
    methods: [
      {
        name: 'onClick',
        kind: 'handler',
        code: 'console.log("clicked")',
        parameters: [],
        sideEffects: [],
      },
    ],
    events: [
      {
        selector: 'button',
        event: 'click',
        handler: 'onClick',
      },
    ],
    
  },
};

describe('FrameworkCodeGenerator - Phase 2', () => {
  describe('Angular support', () => {
    it('should generate Angular component', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateComponent(mockComponent, {
        framework: 'angular',
        typescript: true,
      });

      expect(result).not.toBeNull();
      expect(result?.language).toBe('ts');
      expect(result?.code).toContain('@Component');
      expect(result?.code).toContain('ButtonComponent');
    });

    it('should generate Angular app template', () => {
      const gen = new FrameworkCodeGenerator();
      const mockGenerated = [
        {
          name: 'Button',
          code: '',
          language: 'ts' as const,
          imports: [],
          dependencies: [],
          metadata: { hasState: false, eventCount: 0, styleSize: 0 },
        },
      ];

      const appTemplate = gen.generateAppTemplate(mockGenerated, {
        framework: 'angular',
      });

      expect(appTemplate).toContain('AppComponent');
      expect(appTemplate).toContain('standalone: true');
      expect(appTemplate).toContain('Button');
    });

    it('should generate Angular main.ts entry', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateMainEntry({
        framework: 'angular',
        typescript: true,
      });

      expect(result.filename).toBe('main.ts');
      expect(result.code).toContain('bootstrapApplication');
      expect(result.code).toContain('AppComponent');
    });

    it('should generate Angular package.json', () => {
      const gen = new FrameworkCodeGenerator();
      const pkg = gen.generatePackageJson('test-app', { framework: 'angular' }, []);

      expect(pkg.name).toBe('test-app');
      expect(pkg.dependencies['@angular/core']).toBeDefined();
      expect(pkg.dependencies['@angular/common']).toBeDefined();
      expect(pkg.scripts.dev).toBe('ng serve');
    });
  });

  describe('Svelte support', () => {
    it('should generate Svelte component', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateComponent(mockComponent, {
        framework: 'svelte',
        typescript: true,
      });

      expect(result).not.toBeNull();
      expect(result?.language).toBe('svelte');
      expect(result?.code).toContain('<script lang="ts">');
      expect(result?.code).toContain('let label');
    });

    it('should generate Svelte app template', () => {
      const gen = new FrameworkCodeGenerator();
      const mockGenerated = [
        {
          name: 'Button',
          code: '',
          language: 'svelte' as const,
          imports: [],
          dependencies: [],
          metadata: { hasState: false, eventCount: 0, styleSize: 0 },
        },
      ];

      const appTemplate = gen.generateAppTemplate(mockGenerated, {
        framework: 'svelte',
      });

      expect(appTemplate).toContain('import Button');
      expect(appTemplate).toContain('<Button />');
      expect(appTemplate).toContain('<style>');
    });

    it('should generate Svelte main.ts entry', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateMainEntry({
        framework: 'svelte',
        typescript: true,
      });

      expect(result.filename).toBe('main.ts');
      expect(result.code).toContain('new App');
    });

    it('should generate Svelte package.json', () => {
      const gen = new FrameworkCodeGenerator();
      const pkg = gen.generatePackageJson('test-app', { framework: 'svelte' }, []);

      expect(pkg.name).toBe('test-app');
      expect(pkg.dependencies.svelte).toBeDefined();
      expect(pkg.scripts.dev).toBe('vite');
    });
  });

  describe('jQuery support', () => {
    it('should generate jQuery component', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateComponent(mockComponent, {
        framework: 'jquery',
        typescript: true,
      });

      expect(result).not.toBeNull();
      expect(result?.language).toBe('ts');
      expect(result?.code).toContain('export class Button');
      expect(result?.code).toContain('private $root: JQuery');
    });

    it('should generate jQuery app with component initialization', () => {
      const gen = new FrameworkCodeGenerator();
      const mockGenerated = [
        {
          name: 'Button',
          code: '',
          language: 'ts' as const,
          imports: [],
          dependencies: [],
          metadata: { hasState: false, eventCount: 0, styleSize: 0 },
        },
      ];

      const appTemplate = gen.generateAppTemplate(mockGenerated, {
        framework: 'jquery',
      });

      expect(appTemplate).toContain('import { Button }');
      expect(appTemplate).toContain('new Button');
      expect(appTemplate).toContain('$(document).ready');
    });

    it('should generate jQuery main with TypeScript', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateMainEntry({
        framework: 'jquery',
        typescript: true,
      });

      expect(result.filename).toBe('main.ts');
      expect(result.code).toContain("import $ from 'jquery'");
    });

    it('should generate jQuery main with JavaScript', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateMainEntry({
        framework: 'jquery',
        typescript: false,
      });

      expect(result.filename).toBe('main.js');
    });

    it('should generate jQuery package.json', () => {
      const gen = new FrameworkCodeGenerator();
      const pkg = gen.generatePackageJson('test-app', { framework: 'jquery' }, []);

      expect(pkg.name).toBe('test-app');
      expect(pkg.dependencies.jquery).toBeDefined();
      expect(pkg.devDependencies['@types/jquery']).toBeDefined();
    });
  });

  describe('multi-framework support', () => {
    it('should generate components for all supported frameworks', () => {
      const gen = new FrameworkCodeGenerator();
      const frameworks: Array<'vue' | 'react' | 'angular' | 'svelte' | 'jquery'> = [
        'vue',
        'react',
        'angular',
        'svelte',
        'jquery',
      ];

      frameworks.forEach((framework) => {
        const result = gen.generateComponent(mockComponent, {
          framework,
          typescript: true,
        });

        expect(result).not.toBeNull();
        expect(result?.name).toBe('Button');
      });
    });

    it('should generate package.json for all frameworks', () => {
      const gen = new FrameworkCodeGenerator();
      const frameworks: Array<'vue' | 'react' | 'angular' | 'svelte' | 'jquery'> = [
        'vue',
        'react',
        'angular',
        'svelte',
        'jquery',
      ];

      frameworks.forEach((framework) => {
        const pkg = gen.generatePackageJson('test-app', { framework }, []);

        expect(pkg.name).toBe('test-app');
        expect(pkg.scripts.dev).toBeDefined();
        expect(pkg.dependencies).toBeDefined();
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid framework gracefully', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateComponent(mockComponent, {
        // @ts-expect-error testing invalid framework
        framework: 'invalid',
      });

      expect(result).toBeNull();
    });

    it('should return empty string for invalid app template', () => {
      const gen = new FrameworkCodeGenerator();
      const appTemplate = gen.generateAppTemplate([], {
        // @ts-expect-error testing invalid framework
        framework: 'invalid',
      });

      expect(appTemplate).toBe('');
    });

    it('should return empty string for invalid main entry', () => {
      const gen = new FrameworkCodeGenerator();
      const result = gen.generateMainEntry({
        // @ts-expect-error testing invalid framework
        framework: 'invalid',
      });

      expect(result.filename).toBe('');
      expect(result.code).toBe('');
    });
  });
});
