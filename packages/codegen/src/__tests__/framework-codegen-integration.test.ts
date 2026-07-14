/**
 * Integration tests for framework code generation pipeline
 */

import { describe, it, expect } from 'vitest';
import type { ComponentSpec, FrameworkCodeGenOptions } from '@web-clone/types';
import { FrameworkCodeGenerator } from '../index.js';

const mockComponents: ComponentSpec[] = [
  {
    name: 'Header',
    type: 'presentational',
    children: [],
    template: '<header class="header"><h1>Title</h1></header>',
    styles: '.header { background: white; }',
    manifest: {
      name: 'Header',
      type: 'presentational',
      path: 'components/Header',
      children: [],
      state: {},
      events: {},
      migration: {
        effort: '0.5h',
        effortBreakdown: { extraction: '5m', conversion: '10m' },
        suggestions: [],
        
      },
    },
    logic: {
      state: [],
      methods: [],
      events: [],
      
    },
  },
  {
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
  },
];

describe('FrameworkCodeGenerator', () => {
  describe('initialization', () => {
    it('should create generator instance', () => {
      const gen = new FrameworkCodeGenerator();
      expect(gen).toBeDefined();
    });
  });

  describe('single component generation', () => {
    it('should generate Vue component', () => {
      const gen = new FrameworkCodeGenerator();
      const options: FrameworkCodeGenOptions = {
        framework: 'vue',
        typescript: true,
      };

      const result = gen.generateComponent(mockComponents[0], options);

      expect(result).not.toBeNull();
      expect(result?.language).toBe('vue');
      expect(result?.code).toContain('<template>');
    });

    it('should generate React component', () => {
      const gen = new FrameworkCodeGenerator();
      const options: FrameworkCodeGenOptions = {
        framework: 'react',
        typescript: true,
      };

      const result = gen.generateComponent(mockComponents[0], options);

      expect(result).not.toBeNull();
      expect(result?.language).toBe('tsx');
      expect(result?.code).toContain('export default function');
    });

    it('should return null when no framework specified', () => {
      const gen = new FrameworkCodeGenerator();
      const options: FrameworkCodeGenOptions = {};

      const result = gen.generateComponent(mockComponents[0], options);

      expect(result).toBeNull();
    });
  });

  describe('multiple component generation', () => {
    it('should generate all Vue components', () => {
      const gen = new FrameworkCodeGenerator();
      const options: FrameworkCodeGenOptions = {
        framework: 'vue',
        typescript: true,
      };

      const result = gen.generateComponents(mockComponents, options);

      expect(result.components).toHaveLength(2);
      expect(result.components[0].name).toBe('Header');
      expect(result.components[1].name).toBe('Button');
    });

    it('should generate all React components', () => {
      const gen = new FrameworkCodeGenerator();
      const options: FrameworkCodeGenOptions = {
        framework: 'react',
        typescript: true,
      };

      const result = gen.generateComponents(mockComponents, options);

      expect(result.components).toHaveLength(2);
      expect(result.components.every(c => c.language === 'tsx')).toBe(true);
    });
  });

  describe('app template generation', () => {
    it('should generate Vue app template', () => {
      const gen = new FrameworkCodeGenerator();
      const mockGenerated = mockComponents.map(c => ({
        name: c.name,
        code: '',
        language: 'vue' as const,
        imports: [],
        dependencies: [],
        metadata: {
          hasState: false,
          eventCount: 0,
          styleSize: 0,
        },
      }));

      const appTemplate = gen.generateAppTemplate(mockGenerated, {
        framework: 'vue',
      });

      expect(appTemplate).toContain('<template>');
      expect(appTemplate).toContain('Header');
      expect(appTemplate).toContain('Button');
    });

    it('should generate React app template', () => {
      const gen = new FrameworkCodeGenerator();
      const mockGenerated = mockComponents.map(c => ({
        name: c.name,
        code: '',
        language: 'jsx' as const,
        imports: [],
        dependencies: [],
        metadata: {
          hasState: false,
          eventCount: 0,
          styleSize: 0,
        },
      }));

      const appTemplate = gen.generateAppTemplate(mockGenerated, {
        framework: 'react',
      });

      expect(appTemplate).toContain('export default function App');
      expect(appTemplate).toContain('Header');
      expect(appTemplate).toContain('Button');
    });

    it('should return empty string when no framework specified', () => {
      const gen = new FrameworkCodeGenerator();

      const appTemplate = gen.generateAppTemplate([], {});

      expect(appTemplate).toBe('');
    });
  });

  describe('main entry generation', () => {
    it('should generate Vue main.ts', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateMainEntry({ framework: 'vue' });

      expect(result.filename).toBe('main.ts');
      expect(result.code).toContain('createApp');
      expect(result.code).toContain('mount');
    });

    it('should generate React main.tsx', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateMainEntry({
        framework: 'react',
        typescript: true,
      });

      expect(result.filename).toBe('main.tsx');
      expect(result.code).toContain('ReactDOM.createRoot');
    });

    it('should generate React main.jsx when not using TypeScript', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateMainEntry({
        framework: 'react',
        typescript: false,
      });

      expect(result.filename).toBe('main.jsx');
    });
  });

  describe('package.json generation', () => {
    it('should generate Vue package.json', () => {
      const gen = new FrameworkCodeGenerator();

      const pkg = gen.generatePackageJson('test-app', { framework: 'vue' }, []);

      expect(pkg.name).toBe('test-app');
      expect(pkg.dependencies.vue).toBeDefined();
      expect(pkg.scripts.dev).toBe('vite');
      expect(pkg.scripts.build).toContain('vite build');
    });

    it('should generate React package.json', () => {
      const gen = new FrameworkCodeGenerator();

      const pkg = gen.generatePackageJson('test-app', { framework: 'react' }, []);

      expect(pkg.name).toBe('test-app');
      expect(pkg.dependencies.react).toBeDefined();
      expect(pkg.dependencies['react-dom']).toBeDefined();
      expect(pkg.scripts.dev).toBe('vite');
    });

    it('should include dependencies in package.json', () => {
      const gen = new FrameworkCodeGenerator();

      const pkg = gen.generatePackageJson('test-app', { framework: 'vue' }, [
        'axios',
        'dayjs',
      ]);

      expect(pkg.dependencies.axios).toBeDefined();
      expect(pkg.dependencies.dayjs).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing framework gracefully', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateComponent(mockComponents[0], {});

      expect(result).toBeNull();
    });

    it('should filter out null components', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateComponents(mockComponents, {});

      expect(result.components).toHaveLength(0);
    });
  });

  describe('options handling', () => {
    it('should respect TypeScript flag', () => {
      const gen = new FrameworkCodeGenerator();

      const tsResult = gen.generateMainEntry({
        framework: 'react',
        typescript: true,
      });
      const jsResult = gen.generateMainEntry({
        framework: 'react',
        typescript: false,
      });

      expect(tsResult.filename).toBe('main.tsx');
      expect(jsResult.filename).toBe('main.jsx');
    });

    it('should include CSS Modules in React when specified', () => {
      const gen = new FrameworkCodeGenerator();

      const result = gen.generateComponent(mockComponents[0], {
        framework: 'react',
        cssModules: true,
      });

      expect(result?.code).toContain('styles.module.css');
    });
  });
});
