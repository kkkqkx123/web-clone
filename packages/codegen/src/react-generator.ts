import type { ComponentSpec } from '@web-clone/types';
import type { FrameworkCodeGenOptions, GeneratedComponent } from '@web-clone/types';
import type { StateVariable, EventBinding, MethodSpec } from '@web-clone/types';
import { BaseFrameworkGenerator } from './base-generator.js';
import { templateRules } from './framework-rules.js';

/**
 * React Component Generator
 * Generates React functional components with hooks
 */
export class ReactGenerator extends BaseFrameworkGenerator {
  constructor() {
    super('react');
  }

  generate(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent {
    const componentName = this.pascalCase(spec.name);
    const isTypeScript = options.typescript ?? true;

    // 1. Generate imports
    const imports = this.collectImports(spec, options);
    const importStatements = this.generateImports(imports, options);

    // 2. Generate props interface
    const propsInterface = this.generatePropsInterface(componentName);

    // 3. Transform template
    const jsx = this.mapTemplate(spec.template, spec.logic, options);

    // 4. Generate state hooks and methods
    const stateHooks = this.mapState(spec.logic?.state || [], options);
    const lifecycleEffects = this.generateLifecycleEffects(spec.logic);
    const methods = this.extractMethods(spec.logic);
    const styles = this.generateStyleImport(spec, options);

    // 5. Assemble complete component
    const code = `${importStatements}
${propsInterface}

export default function ${componentName}() {
${stateHooks ? `  ${stateHooks}\n` : ''}
${lifecycleEffects ? `${lifecycleEffects}\n` : ''}
${methods ? `  ${methods}\n` : ''}
  return (
    <>${jsx}</>
  )
}
${styles ? `\n${styles}` : ''}`;

    return {
      name: componentName,
      code,
      language: isTypeScript ? 'tsx' : 'jsx',
      imports: importStatements.split('\n').filter((l) => l.trim().startsWith('import')),
      dependencies: this.resolveDependencies(spec, options),
      metadata: this.buildMetadata(spec)
    };
  }

  private generateImports(
    imports: string[],
    _options: FrameworkCodeGenOptions
  ): string {
    const reactHooks = new Set<string>(['useState', 'useEffect', 'useMemo', 'useCallback']);

    const hooksToImport = imports.filter((i) => reactHooks.has(i));

    let importStr = '';

    // Always import React for JSX
    importStr += `import React from 'react'\n`;

    // React hooks imports
    if (hooksToImport.length > 0) {
      importStr += `import { ${hooksToImport.join(', ')} } from 'react'\n`;
    }

    // Styles
    if (imports.some((i) => i.includes('styles'))) {
      importStr += `import styles from './styles.module.css'\n`;
    }

    return importStr.trim();
  }

  private generatePropsInterface(componentName: string): string {
    return `interface ${componentName}Props {
  // TODO: Define component props
}
`;
  }

  /**
   * Generate useEffect calls for lifecycle methods (kind === 'lifecycle').
   * Uses useEffect with empty deps for mount-like hooks, and returns a
   * cleanup function for unmount-like hooks.
   */
  private generateLifecycleEffects(logic: { methods?: MethodSpec[] } | undefined): string {
    if (!logic?.methods || logic.methods.length === 0) {
      return '';
    }

    const lifecycleMethods = logic.methods.filter((m) => m.kind === 'lifecycle');
    if (lifecycleMethods.length === 0) {
      return '';
    }

    return lifecycleMethods
      .map((m) => {
        const isUnmount = m.name === 'unmounted' || m.name === 'beforeUnmount' || m.name === 'destroy' || m.name === 'destroyed';
        const comment = `// Lifecycle: ${m.name}`;
        if (isUnmount) {
          return `  ${comment}
  useEffect(() => {
    // TODO: Implement ${m.name}
    // Original: ${m.code?.substring(0, 80)}...
    return () => {
      // Cleanup logic for ${m.name}
    };
  }, [])`;
        }
        return `  ${comment}
  useEffect(() => {
    // TODO: Implement ${m.name}
    // Original: ${m.code?.substring(0, 80)}...
  }, [])`;
      })
      .join('\n\n');
  }

  private generateStyleImport(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): string {
    if (!spec.styles || spec.styles.trim() === '') {
      return '';
    }

    if (options.cssModules) {
      // Placeholder for CSS Modules import
      return `// Import from ${this.camelCase(spec.name)}.module.css`;
    }

    // Inline styles comment with proper format
    const cssLines = spec.styles.split('\n').slice(0, 3);
    return `/* CSS Rules:\n${cssLines.map(line => ` * ${line}`).join('\n')}\n */`;
  }

  protected mapState(
    state: StateVariable[],
    options: FrameworkCodeGenOptions
  ): string {
    if (state.length === 0) {
      return '';
    }

    return state
      .map((s) => {
        const setter = `set${this.pascalCase(s.name)}`;
        const type = options.typescript ? `<${s.type}>` : '';
        const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
        return `const [${s.name}, ${setter}] = useState${type}(${initialValue})`;
      })
      .join('\n  ');
  }

  protected mapEvents(
    events: EventBinding[],
    _options: FrameworkCodeGenOptions
  ): string {
    return this.generateEventHandlerStubs(events);
  }

  protected mapTemplate(
    html: string,
    logic: unknown,
    options: FrameworkCodeGenOptions
  ): string {
    // Step 1: Shared common processing (data-binding, data-event, data-condition, cleanAttributes, root wrap)
    let jsx = this.processTemplate(html, logic, options);

    // Step 2: Convert HTML attributes to JSX equivalents (class→className, for→htmlFor, etc.)
    jsx = templateRules.htmlToJsx(jsx);

    // Step 3: Fix self-closing tags for JSX (<img> → <img />)
    jsx = templateRules.fixSelfClosing(jsx);

    return jsx.trim();
  }

  protected mapStyles(
    css: string,
    options: FrameworkCodeGenOptions
  ): string {
    return super.mapStyles(css, options);
  }

  protected collectImports(
    spec: ComponentSpec,
    _options: FrameworkCodeGenOptions
  ): string[] {
    const imports = new Set<string>(['React']);

    // Need useState for state
    if (spec.logic?.state && spec.logic.state.length > 0) {
      imports.add('useState');
    }

    // Only add useCallback if actually using memoized callbacks
    // For now, we generate simple inline handlers, so this is not needed
    // if (spec.logic?.events && spec.logic.events.length > 0) {
    //   imports.add('useCallback');
    // }

    // Need useEffect for lifecycle
    if (spec.logic?.methods?.some((m: MethodSpec) => m.kind === 'lifecycle')) {
      imports.add('useEffect');
    }

    // Need useMemo for complex computations
    if (
      spec.logic?.methods?.some((m: { code?: string; kind?: string }) =>
        m.code?.includes('computed') || m.code?.includes('useMemo')
      )
    ) {
      imports.add('useMemo');
    }

    // Style imports
    if (spec.styles) {
      imports.add('styles');
    }

    return Array.from(imports);
  }

  // ─── App template, main entry ────────────────────────────────────────────

  generateAppTemplate(components: GeneratedComponent[]): string {
    const imports = components
      .map((c) => `import ${c.name} from './components/${c.name}/${c.name}'`)
      .join('\n');
    const templateLines = components.map((c) => `      <${c.name} />`).join('\n');

    return `import React from 'react'
${imports}
import './App.css'

export default function App() {
  React.useEffect(() => {
    console.log('App mounted')
  }, [])

  return (
    <div id="app">
      <main>
${templateLines}
      </main>
    </div>
  )
}
`;
  }

  generateMainEntry(options: FrameworkCodeGenOptions): { filename: string; code: string } {
    return {
      filename: options.typescript ? 'main.tsx' : 'main.jsx',
      code: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
    };
  }
}
