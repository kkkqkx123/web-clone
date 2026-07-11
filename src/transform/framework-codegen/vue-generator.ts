import type { ComponentSpec } from '../../types.js';
import type { FrameworkCodeGenOptions, GeneratedComponent } from '../../types.js';
import type { StateVariable, EventBinding } from '../../types.js';
import { BaseFrameworkGenerator } from './base-generator.js';
import { frameworkRules, templateRules } from './framework-rules.js';

/**
 * Vue 3 SFC Generator
 * Generates Vue Single File Components with <script setup>
 */
export class VueGenerator extends BaseFrameworkGenerator {
  constructor() {
    super('vue');
  }

  generate(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent {
    const componentName = this.pascalCase(spec.name);
    const imports = this.collectImports(spec, options);

    // 1. Generate script setup section
    const scriptContent = this.generateScriptSetup(spec, options, imports);

    // 2. Transform template
    const template = this.mapTemplate(spec.template, spec.logic, options);

    // 3. Handle styles
    const styles = this.mapStyles(spec.styles || '', options);

    // 4. Assemble complete SFC
    const code = `<template>
  ${template}
</template>

<script setup lang="ts">
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

  private generateScriptSetup(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions,
    imports: string[]
  ): string {
    let script = '';

    // Add imports
    if (imports.length > 0) {
      script += `import { ${imports.join(', ')} } from 'vue'\n`;
    }

    script += '\n';

    // Add state variables
    if (spec.logic?.state && spec.logic.state.length > 0) {
      script += this.mapState(spec.logic.state, options);
      script += '\n\n';
    }

    // Add methods/event handlers
    if (spec.logic?.methods && spec.logic.methods.length > 0) {
      script += this.extractMethods(spec.logic);
      script += '\n';
    }

    // Add comment for further implementation
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
      .map((s) => frameworkRules.vue.stateDeclaration(s.name, s.type, s.initial))
      .join('\n');
  }

  protected mapEvents(
    events: EventBinding[]
  ): string {
    return this.generateEventHandlerStubs(events);
  }

  protected mapTemplate(
    html: string,
    _logic: unknown,
    _options: FrameworkCodeGenOptions
  ): string {
    let template = html;

    // Step 1: Replace data-binding with Vue interpolation
    // data-binding="count" -> {{ count }}
    template = template.replace(
      /data-binding="([^"]+)"/g,
      (_match, variable) => frameworkRules.vue.templateBinding(variable)
    );

    // Step 2: Replace data-event with Vue event directive
    // data-event="click:increment" -> @click="increment"
    template = template.replace(
      /data-event="([^:]+):([^"]+)"/g,
      (_match, event, handler) =>
        frameworkRules.vue.eventBinding(event, handler)
    );

    // Step 3: Replace data-condition with v-if
    // data-condition="count > 0" -> v-if="count > 0"
    template = template.replace(
      /data-condition="([^"]+)"/g,
      (_match, condition) =>
        frameworkRules.vue.conditionalBinding(condition)
    );

    // Step 4: Clean up remaining data-* attributes
    template = templateRules.cleanAttributes(template);

    // Step 5: Wrap in root div if needed
    if (!template.trim().startsWith('<')) {
      template = `<div>${template}</div>`;
    }

    return template.trim();
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

    // Always need ref for state
    if (spec.logic?.state && spec.logic.state.length > 0) {
      imports.add('ref');
    }

    // Add lifecycle imports based on detected lifecycle method names
    const lifecycleMethods = new Set(['mounted', 'unmounted', 'created', 'destroyed', 'init', 'destroy']);
    if (spec.logic?.methods?.some((m: { name: string }) => lifecycleMethods.has(m.name))) {
      imports.add('onMounted');
      imports.add('onUnmounted');
    }

    return Array.from(imports);
  }
}
