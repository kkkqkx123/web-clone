/**
 * Minimal type declarations for @web-clone/codegen (optional peer dependency).
 *
 * These stubs allow core to compile independently. At runtime, the actual
 * @web-clone/codegen workspace package provides the real implementation.
 */

declare module '@web-clone/codegen' {
  import type { ComponentSpec } from './types.js';

  export class FrameworkCodeGenerator {
    generateComponent(comp: ComponentSpec, options: any): { name: string; code: string; language: string } | null;
    generateAppTemplate(
      components: Array<{ name: string; code: string; language: string; imports: string[]; dependencies: string[]; metadata: Record<string, unknown> }>,
      options: any,
    ): string;
    generateMainEntry(options: any): { filename: string; code: string };
    generatePackageJson(name: string, options: any, deps: string[]): Record<string, unknown>;
  }

  export const codeGenerator: FrameworkCodeGenerator;

  export class ConfigGenerator {
    static generateIndexHtml(framework: string, typescript?: boolean): string;
    static generateViteConfig(framework: string): string;
    static generateTsConfig(framework: string): string;
    static generateTsAppConfig(framework: string): string;
    static generateEnvExample(): string;
  }

  export class SharedLogicExtractor {
    static extractApiLogic(specs: ComponentSpec[]): string;
    static extractUtilities(specs: ComponentSpec[]): string;
    static extractConstants(specs: ComponentSpec[]): string;
  }
}
