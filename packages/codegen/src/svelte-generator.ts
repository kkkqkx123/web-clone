import { BaseFrameworkGenerator } from './base-generator.js';
import type { ComponentSpec, FrameworkCodeGenOptions, GeneratedComponent } from '@web-clone/types';
import type { StateVariable, EventBinding } from '@web-clone/types';

/**
 * Svelte component code generator
 * Generates Svelte single-file components with reactive variables
 */
export class SvelteGenerator extends BaseFrameworkGenerator {
  constructor() {
    super('svelte');
  }

  generate(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent {
    const stateDeclarations = this.mapState(spec.logic?.state || [], options);
    const eventMethods = this.mapEvents(spec.logic?.events || [], options);
    const template = this.mapTemplate(spec.template, spec.logic, options);
    const styles = this.mapStyles(spec.styles, options);
    const useTs = options.typescript !== false;

    const langAttr = useTs ? ' lang="ts"' : '';
    const code = `<script${langAttr}>
${stateDeclarations}

${eventMethods}
</script>

<div>
${template}
</div>${styles}`;

    const imports = this.collectImports(spec, options);

    return {
      name: spec.name,
      code,
      language: 'svelte',
      imports,
      dependencies: this.resolveDependencies(spec, options),
      metadata: this.buildMetadata(spec)
    };
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
        const typeHint = options.typescript !== false && s.type !== 'unknown'
          ? `: ${s.type}` : '';
        const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
        return `  let ${s.name}${typeHint} = ${initialValue};`;
      })
      .join('\n');
  }

  protected mapEvents(
    events: EventBinding[],
    _options: FrameworkCodeGenOptions
  ): string {
    if (events.length === 0) {
      return '';
    }
    return events
      .map((e) => {
        const handlerName = e.handler || `handle${this.pascalCase(e.event)}`;
        return `const ${handlerName} = () => {
    // TODO: Handle ${e.event} event on ${e.selector}
  };`;
      })
      .join('\n\n');
  }

  protected mapTemplate(
    html: string,
    logic: unknown,
    options: FrameworkCodeGenOptions
  ): string {
    // Step 1: Shared common processing (data-binding, data-event, data-condition, cleanAttributes)
    let template = this.processTemplate(html, logic, options);

    // Step 2: Indent template content for Svelte's <script> / <div> structure
    template = template
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n');

    return template;
  }

  protected mapStyles(
    css: string,
    _options: FrameworkCodeGenOptions
  ): string {
    return super.mapStyles(css, _options);
  }

  protected collectImports(
    _spec: ComponentSpec,
    _options: FrameworkCodeGenOptions
  ): string[] {
    // Svelte doesn't require explicit imports in most cases
    // Dependencies are listed in package.json
    return [];
  }

  // ─── App template, main entry ────────────────────────────────────────────

  generateAppTemplate(components: GeneratedComponent[]): string {
    const imports = components
      .map((c) => `import ${c.name} from './components/${c.name}/${c.name}.svelte';`)
      .join('\n');
    const templateLines = components.map((c) => `  <${c.name} />`).join('\n');

    return `<script lang="ts">
import { onMount } from 'svelte';
${imports}

onMount(() => {
  console.log('App mounted');
});
</script>

<div id="app">
  <main>
${templateLines}
  </main>
</div>

<style>
  #app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 1rem;
  }
  main {
    flex: 1;
  }
</style>
`;
  }

  generateMainEntry(_options: FrameworkCodeGenOptions): { filename: string; code: string } {
    return {
      filename: 'main.ts',
      code: `import App from './App.svelte'

const app = new App({
  target: document.getElementById('app')!,
})

export default app
`,
    };
  }
}