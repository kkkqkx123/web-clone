import { BaseFrameworkGenerator } from './base-generator.js';
import type { ComponentSpec, FrameworkCodeGenOptions, GeneratedComponent } from '@web-clone/types';
import type { StateVariable, EventBinding } from '@web-clone/types';

/**
 * Angular component code generator
 * Generates standalone Angular components with TypeScript decorators
 */
export class AngularGenerator extends BaseFrameworkGenerator {
  constructor() {
    super('angular');
  }

  generate(
    spec: ComponentSpec,
    options: FrameworkCodeGenOptions
  ): GeneratedComponent {
    const imports = this.collectImports(spec, options);
    const componentName = this.pascalCase(spec.name);
    const selector = `app-${this.camelCase(spec.name)}`;

    const stateDeclarations = this.mapState(spec.logic?.state || [], options);
    const eventMethods = this.mapEvents(spec.logic?.events || [], options);
    const template = this.mapTemplate(spec.template, spec.logic, options);
    const styles = this.mapStyles(spec.styles, options);

    // Build decorator imports array (module classes needed at runtime)
    const decoratorModules = this.getDecoratorModuleImports(spec);
    const importsLine = decoratorModules.length > 0
      ? `\n  imports: [${decoratorModules.join(', ')}],`
      : '';

    const code = `${imports.join('\n')}

@Component({
  selector: '${selector}',
  template: \`${template}\`,${styles}
  standalone: true,${importsLine}
})
export class ${componentName}Component {
  ${stateDeclarations}

  ${eventMethods}
}
`;

    return {
      name: spec.name,
      code,
      language: 'ts',
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
        const typeHint = options.typescript !== false ? `: ${s.type}` : '';
        const initialValue = s.initial !== undefined ? JSON.stringify(s.initial) : 'undefined';
        return `${s.name}${typeHint} = ${initialValue};`;
      })
      .join('\n  ');
  }

  protected mapEvents(
    events: EventBinding[],
    _options: FrameworkCodeGenOptions
  ): string {
    return this.deduplicateEvents(events);
  }

  protected mapTemplate(
    html: string,
    logic: unknown,
    options: FrameworkCodeGenOptions
  ): string {
    return this.processTemplate(html, logic, options);
  }

  protected mapStyles(
    css: string,
    _options: FrameworkCodeGenOptions
  ): string {
    return super.mapStyles(css, _options);
  }

  protected collectImports(
    spec: ComponentSpec,
    _options: FrameworkCodeGenOptions
  ): string[] {
    const imports = [
      "import { Component } from '@angular/core';",
      "import { CommonModule } from '@angular/common';",
    ];

    // Add FormsModule only if template contains ngModel pattern
    if (spec.template.includes('[(ngModel)]')) {
      imports.push("import { FormsModule } from '@angular/forms';");
    }

    return imports;
  }

  /**
   * Determine which Angular modules to include in @Component.imports array.
   * These must match the named imports in collectImports().
   */
  private getDecoratorModuleImports(spec: ComponentSpec): string[] {
    const modules: string[] = ['CommonModule'];
    if (spec.template.includes('[(ngModel)]')) {
      modules.push('FormsModule');
    }
    return modules;
  }

  // ─── App template, main entry ────────────────────────────────────────────

  generateAppTemplate(components: GeneratedComponent[]): string {
    const imports = components
      .map((c) => `import { ${c.name}Component } from './components/${c.name}/${c.name}.component';`)
      .join('\n');

    const declarations = components
      .map((c) => `    ${c.name}Component`)
      .join(',\n');

    const templateLines = components
      .map((c) => `    <app-${this.pascalToKebab(c.name)} />`)
      .join('\n');

    return `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
${imports}

@Component({
  selector: 'app-root',
  template: \`
    <div id="app">
      <main>
${templateLines}
      </main>
    </div>
  \`,
  styles: [\`
    #app {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      padding: 1rem;
    }
    main {
      flex: 1;
    }
  \`],
  standalone: true,
  imports: [CommonModule, ${declarations}],
})
export class AppComponent {
  ngOnInit() {
    console.log('App initialized');
  }
}
`;
  }

  generateMainEntry(_options: FrameworkCodeGenOptions): { filename: string; code: string } {
    return {
      filename: 'main.ts',
      code: `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { appConfig } from './app.config';

bootstrapApplication(AppComponent, appConfig).catch(err =>
  console.error(err),
);
`,
    };
  }

  /**
   * Convert PascalCase to kebab-case for Angular selectors
   */
  private pascalToKebab(str: string): string {
    return str
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
  }
}
