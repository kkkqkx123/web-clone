import type { ComponentSpec } from '@web-clone/types';
import type { FrameworkCodeGenOptions, GeneratedComponent } from '@web-clone/types';
import type { StateVariable, EventBinding, MethodSpec } from '@web-clone/types';
import { BaseFrameworkGenerator } from './base-generator.js';

export class VueGenerator extends BaseFrameworkGenerator {
  constructor() {
    super('vue');
  }

  generate(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent {
    const componentName = this.pascalCase(spec.name);
    const useTs = options.typescript !== false;

    // Branch: Options API or Composition API
    if (options.vueApi === 'options') {
      return this.generateOptionsAPI(spec, options, componentName, useTs);
    }

    // Default: Composition API (<script setup>)
    const imports = this.collectImports(spec, options);
    const scriptContent = this.generateScriptSetup(spec, options, imports);

    const template = this.mapTemplate(spec.template, spec.logic, options);

    const styles = this.mapStyles(spec.styles || '', options);

    const langAttr = useTs ? ' lang="ts"' : '';
    const code = `<template>
  ${template}
</template>

<script setup${langAttr}>
${scriptContent}
</script>

${styles}`;

    return {
      name: componentName,
      code,
      language: 'vue',
      imports,
      dependencies: this.resolveDependencies(spec, options),
      metadata: this.buildMetadata(spec)
    };
  }

  private generateOptionsAPI(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions,
    componentName: string,
    useTs: boolean
  ): GeneratedComponent {
    const template = this.mapTemplate(spec.template, spec.logic, options);
    const styles = this.mapStyles(spec.styles || '', options);
    const langAttr = useTs ? ' lang="ts"' : '';

    // Build component options
    const parts: string[] = [];

    // data()
    const stateProps = this.mapOptionsState(spec.logic?.state || [], options);
    if (stateProps) {
      parts.push(`  data() {
    return { ${stateProps} }
  }`);
    }

    // methods
    const methodsStr = this.mapOptionsMethods(spec.logic);
    if (methodsStr) {
      parts.push(`  methods: {
${methodsStr}
  }`);
    }

    // Lifecycle hooks
    const lifecycleStr = this.mapOptionsLifecycle(spec.logic?.methods);
    if (lifecycleStr) {
      parts.push(lifecycleStr);
    }

    const optionsStr = parts.join(',\n');

    const code = `<template>
  ${template}
</template>

<script${langAttr}>
export default {
  name: '${componentName}',${optionsStr ? `\n${optionsStr}\n` : ''}
}
</script>

${styles}`;

    return {
      name: componentName,
      code,
      language: 'vue',
      imports: [],
      dependencies: this.resolveDependencies(spec, options),
      metadata: this.buildMetadata(spec)
    };
  }

  private mapOptionsState(
    state: StateVariable[],
    options: FrameworkCodeGenOptions
  ): string {
    if (state.length === 0) return '';
    return state
      .map((s) => {
        const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
        return `${s.name}: ${initialValue}`;
      })
      .join(', ');
  }

  private mapOptionsMethods(logic: { methods?: MethodSpec[] } | undefined): string {
    if (!logic?.methods || logic.methods.length === 0) return '';
    const lifecycleHooks = new Set([
      'mounted','beforeMount','unmounted','beforeUnmount',
      'updated','beforeUpdate','activated','deactivated',
      'created','destroyed','init','destroy',
    ]);
    return logic.methods
      .filter((m) => !lifecycleHooks.has(m.name))
      .map((m) => `    ${m.name}() {
      // TODO: Implement ${m.name}
    }`)
      .join(',\n');
  }

  private mapOptionsLifecycle(methods: MethodSpec[] | undefined): string {
    if (!methods || methods.length === 0) return '';
    const lifecycleMap: Record<string, string> = {
      mounted: 'mounted',
      beforeMount: 'beforeMount',
      unmounted: 'unmounted',
      beforeUnmount: 'beforeUnmount',
      updated: 'updated',
      beforeUpdate: 'beforeUpdate',
      activated: 'activated',
      deactivated: 'deactivated',
      created: 'created',
      destroyed: 'destroyed',
      init: 'created',
      destroy: 'unmounted',
    };
    const hooks: string[] = [];
    for (const m of methods) {
      if (lifecycleMap[m.name]) {
        hooks.push(`  ${lifecycleMap[m.name]}() {
    // TODO: Implement ${m.name}
  }`);
      }
    }
    return hooks.length > 0 ? hooks.join(',\n') : '';
  }

  private generateScriptSetup(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions,
    imports: string[]
  ): string {
    let script = '';

    if (imports.length > 0) {
      script += `import { ${imports.join(', ')} } from 'vue'\n`;
    }

    script += '\n';

    if (spec.logic?.state && spec.logic.state.length > 0) {
      script += this.mapState(spec.logic.state, options);
      script += '\n\n';
    }

    if (spec.logic?.methods && spec.logic.methods.length > 0) {
      script += this.extractMethods(spec.logic);
      script += '\n';
    }

    if (!spec.logic?.state && !spec.logic?.methods) {
      script += '// TODO: Add component logic\n';
    }

    return script.trim();
  }

  protected mapState(
    state: StateVariable[],
    options: FrameworkCodeGenOptions
  ): string {
    return state
      .map((s) => {
        const typeHint = options.typescript !== false && s.type !== 'unknown'
          ? `<${s.type}>` : '';
        const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
        return `const ${s.name} = ref${typeHint}(${initialValue})`;
      })
      .join('\n');
  }

  protected mapEvents(
    events: EventBinding[]
  ): string {
    return this.generateEventHandlerStubs(events);
  }

  protected mapTemplate(
    html: string,
    logic: unknown,
    options: FrameworkCodeGenOptions
  ): string {
    return this.processTemplate(html, logic, options).trim();
  }

  protected mapStyles(
    css: string,
    options: FrameworkCodeGenOptions
  ): string {
    return super.mapStyles(css, options);
  }

  protected collectImports(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): string[] {
    const imports = new Set<string>();

    // Options API doesn't need explicit imports (ref, lifecycle hooks are built-in)
    if (options.vueApi === 'options') {
      return [];
    }

    // Composition API: import ref for state
    if (spec.logic?.state && spec.logic.state.length > 0) {
      imports.add('ref');
    }

    // Composition API: import lifecycle hooks based on actual method names
    // Note: Vue 2 'created' / 'init' have no onCreated equivalent in Composition API
    // because the equivalent is simply top-level code in <script setup>.
    // Vue 2 'destroyed' → 'onUnmounted' (Vue 3), 'destroy' → 'onUnmounted' (alias).
    const lifecycleMap: Record<string, string> = {
      mounted: 'onMounted',
      beforeMount: 'onBeforeMount',
      unmounted: 'onUnmounted',
      beforeUnmount: 'onBeforeUnmount',
      updated: 'onUpdated',
      beforeUpdate: 'onBeforeUpdate',
      activated: 'onActivated',
      deactivated: 'onDeactivated',
      destroyed: 'onUnmounted',
      destroy: 'onUnmounted',
    };
    if (spec.logic?.methods) {
      for (const m of spec.logic.methods) {
        const hook = lifecycleMap[m.name];
        if (hook) {
          imports.add(hook);
        }
      }
    }

    return Array.from(imports);
  }

  // ─── App template, main entry ────────────────────────────────────────────

  generateAppTemplate(components: GeneratedComponent[]): string {
    const imports = components
      .map((c) => `import ${c.name} from './components/${c.name}/${c.name}.vue'`)
      .join('\n');
    const templateLines = components.map((c) => `    <${c.name} />`).join('\n');

    return `<template>
  <div id="app">
    <main>
${templateLines}
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
${imports}

onMounted(() => {
  console.log('App mounted')
})
</script>

<style scoped>
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
      code: `import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')
`,
    };
  }
}