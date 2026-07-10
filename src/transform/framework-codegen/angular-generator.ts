import { BaseFrameworkGenerator } from './base-generator.js';
import type { ComponentSpec, FrameworkCodeGenOptions, GeneratedComponent } from '../../types.js';
import type { StateVariable, EventBinding } from '../../types.js';
import { frameworkRules, cssStrategies, templateRules } from './framework-rules.js';

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

    const code = `${imports.join('\n')}

@Component({
  selector: '${selector}',
  template: \`${template}\`,${styles}
  standalone: true,
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
      .map(
        (s) =>
          frameworkRules.angular.stateDeclaration(s.name, s.type, s.initial)
      )
      .join('\n  ');
  }

  protected mapEvents(
    events: EventBinding[],
    options: FrameworkCodeGenOptions
  ): string {
    return this.deduplicateEvents(events);
  }

  protected mapTemplate(
    html: string,
    logic: any,
    options: FrameworkCodeGenOptions
  ): string {
    let template = html;

    // Replace data-binding with {{ variable }}
    template = template.replace(
      /data-binding="([^"]*)"/g,
      (_, variable) => frameworkRules.angular.templateBinding(variable.trim())
    );

    // Replace data-event with (event)="handler()"
    template = template.replace(
      /data-event="([^:]*):([^"]*)"/g,
      (_, event, handler) =>
        frameworkRules.angular.eventBinding(event.trim(), handler.trim())
    );

    // Replace data-condition with *ngIf
    template = template.replace(
      /data-condition="([^"]*)"/g,
      (_, condition) => `*ngIf="${condition.trim()}"`
    );

    return templateRules.cleanAttributes(template);
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
}
