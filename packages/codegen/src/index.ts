import type { ComponentSpec } from '@web-clone/types';
import type { FrameworkCodeGenOptions, GeneratedComponent, GeneratedFramework } from '@web-clone/types';
import { VueGenerator } from './vue-generator.js';
import { ReactGenerator } from './react-generator.js';
import { AngularGenerator } from './angular-generator.js';
import { SvelteGenerator } from './svelte-generator.js';
import { JQueryGenerator } from './jquery-generator.js';
import { SharedLogicExtractor } from './shared-logic-extractor.js';

type FrameworkGenerator = VueGenerator | ReactGenerator | AngularGenerator | SvelteGenerator | JQueryGenerator;

/**
 * Main entry point for framework code generation
 * Routes to appropriate generator based on framework selection
 */
export class FrameworkCodeGenerator {
  private vueGenerator: VueGenerator;
  private reactGenerator: ReactGenerator;
  private angularGenerator: AngularGenerator;
  private svelteGenerator: SvelteGenerator;
  private jqueryGenerator: JQueryGenerator;

  constructor() {
    this.vueGenerator = new VueGenerator();
    this.reactGenerator = new ReactGenerator();
    this.angularGenerator = new AngularGenerator();
    this.svelteGenerator = new SvelteGenerator();
    this.jqueryGenerator = new JQueryGenerator();
  }

  /**
   * Get the generator instance for the given framework.
   * Reduces duplicate switch statements across the class.
   */
  private getGenerator(framework: string): FrameworkGenerator | null {
    switch (framework) {
      case 'vue': return this.vueGenerator;
      case 'react': return this.reactGenerator;
      case 'angular': return this.angularGenerator;
      case 'svelte': return this.svelteGenerator;
      case 'jquery': return this.jqueryGenerator;
      default: return null;
    }
  }

  /**
   * Generate code for a single component
   */
  generateComponent(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent | null {
    if (!options.framework) {
      return null;
    }

    try {
      const generator = this.getGenerator(options.framework);
      if (!generator) return null;
      return generator.generate(spec, options);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Failed to generate ${options.framework} code for ${spec.name}: ${message}`
      );
      return null;
    }
  }

  /**
   * Generate code for multiple components
   */
  generateComponents(
    specs: ComponentSpec[],
    options: FrameworkCodeGenOptions
  ): GeneratedFramework {
    const components = specs
      .map((spec) => this.generateComponent(spec, options))
      .filter((comp): comp is GeneratedComponent => comp !== null);

    return {
      components,
      shared: this.extractSharedLogic(specs, options),
    };
  }

  /**
   * Extract shared logic (API calls, utilities, etc.)
   */
  private extractSharedLogic(
    specs: ComponentSpec[],
    options: FrameworkCodeGenOptions
  ): { api?: string; utils?: string; constants?: string } | undefined {
    if (!options.extractSharedLogic) {
      return undefined;
    }

    const result: { api?: string; utils?: string; constants?: string } = {};

    // Extract API logic
    result.api = SharedLogicExtractor.extractApiLogic(specs);

    // Extract utilities
    result.utils = SharedLogicExtractor.extractUtilities(specs);

    // Extract constants
    result.constants = SharedLogicExtractor.extractConstants(specs);

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Generate application template (App.vue or App.jsx)
   */
  generateAppTemplate(
    componentSpecs: GeneratedComponent[],
    options: FrameworkCodeGenOptions
  ): string {
    if (!options.framework) {
      return '';
    }
    const generator = this.getGenerator(options.framework);
    return generator?.generateAppTemplate(componentSpecs) ?? '';
  }

  /**
   * Generate main entry point
   */
  generateMainEntry(
    options: FrameworkCodeGenOptions
  ): { filename: string; code: string } {
    if (!options.framework) {
      return { filename: '', code: '' };
    }
    const generator = this.getGenerator(options.framework);
    return generator?.generateMainEntry(options) ?? { filename: '', code: '' };
  }
}

// Export singleton
export const codeGenerator = new FrameworkCodeGenerator();

// Re-exports for convert.ts
export { ConfigGenerator } from './config-generator.js';
export { SharedLogicExtractor } from './shared-logic-extractor.js';
