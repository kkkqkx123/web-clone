/**
 * Framework-specific transformation rules
 * Maps generic component structure to Vue/React/Angular/Svelte/jQuery syntax
 */

export const frameworkRules = {
  vue: {
    // State binding: StateVariable => ref/reactive declaration
    stateDeclaration: (name: string, type: string, initial: any): string => {
      const initialValue = JSON.stringify(initial);
      return `const ${name} = ref<${type}>(${initialValue})`;
    },

    // Template binding: data-binding -> {{ variable }}
    templateBinding: (variable: string): string => `{{ ${variable} }}`,

    // Event binding: data-event="click:handler" -> @click="handler"
    eventBinding: (event: string, handler: string): string =>
      `@${event}="${handler}"`,

    // Conditional: data-condition="count > 0" -> v-if="count > 0"
    conditionalBinding: (condition: string): string => `v-if="${condition}"`,

    // Loop: v-for="item in list"
    loopBinding: (variable: string, list: string): string =>
      `v-for="${variable} in ${list}"`,

    // Style class binding: :class="{ active: isActive }"
    classBinding: (classObj: string): string => `:class="${classObj}"`,

    // Computed property wrapper
    computedWrapper: (name: string, code: string): string =>
      `const ${name} = computed(() => {\n  ${code}\n})`,

    // Imports required for stateful component
    requiredImports: (hasState: boolean, hasComputed: boolean): string[] => {
      const imports = ['vue'];
      if (hasState) imports.push('ref');
      if (hasComputed) imports.push('computed');
      return imports;
    },
  },

  react: {
    // State binding: StateVariable => useState hook
    stateDeclaration: (name: string, type: string, initial: any): string => {
      const initialValue = JSON.stringify(initial);
      const setter = `set${capitalize(name)}`;
      return `const [${name}, ${setter}] = useState<${type}>(${initialValue})`;
    },

    // Template binding: {{ variable }} -> {variable}
    templateBinding: (variable: string): string => `{${variable}}`,

    // Event binding: data-event="click:handler" -> onClick={handler}
    eventBinding: (event: string, handler: string): string => {
      const reactEvent = mapEventToReact(event);
      return `${reactEvent}={${handler}}`;
    },

    // Conditional: data-condition="count > 0" -> {count > 0 && ...}
    conditionalBinding: (condition: string): string =>
      `{${condition} && /* content */}`,

    // Loop: {list.map((item) => ...)}
    loopBinding: (variable: string, list: string): string =>
      `{${list}.map((${variable}) => (...))}`,

    // Style className binding
    classBinding: (classObj: string): string =>
      `className={clsx(${classObj})}`,

    // Callback memo wrapper
    computedWrapper: (name: string, code: string): string =>
      `const ${name} = useCallback(() => {\n  ${code}\n}, [])`,

    // Imports required for stateful component
    requiredImports: (hasState: boolean, hasCallback: boolean): string[] => {
      const imports = ['react'];
      if (hasState) imports.push('useState');
      if (hasCallback) imports.push('useCallback');
      return imports;
    },
  },

  angular: {
    // State binding: StateVariable => class property
    stateDeclaration: (name: string, type: string, initial: any): string => {
      const initialValue = JSON.stringify(initial);
      return `${name}: ${type} = ${initialValue};`;
    },

    // Template binding: data-binding -> {{ variable }}
    templateBinding: (variable: string): string => `{{ ${variable} }}`,

    // Event binding: data-event="click:handler" -> (click)="handler()"
    eventBinding: (event: string, handler: string): string =>
      `(${event})="${handler}()"`,

    // Conditional: data-condition="count > 0" -> *ngIf="count > 0"
    conditionalBinding: (condition: string): string => `*ngIf="${condition}"`,

    // Loop: *ngFor="let item of list"
    loopBinding: (variable: string, list: string): string =>
      `*ngFor="let ${variable} of ${list}"`,

    // Style class binding: [class.active]="isActive"
    classBinding: (classObj: string): string => `[class]="${classObj}"`,

    // Method wrapper
    computedWrapper: (name: string, code: string): string =>
      `${name}() {\n  ${code}\n}`,

    // Imports for Angular component
    requiredImports: (hasState: boolean): string[] => {
      return ['@angular/core', 'Component'];
    },
  },

  svelte: {
    // State binding: StateVariable => let variable
    stateDeclaration: (name: string, type: string, initial: any): string => {
      const initialValue = JSON.stringify(initial);
      return `let ${name}: ${type} = ${initialValue};`;
    },

    // Template binding: data-binding -> {variable}
    templateBinding: (variable: string): string => `{${variable}}`,

    // Event binding: data-event="click:handler" -> on:click={handler}
    eventBinding: (event: string, handler: string): string =>
      `on:${event}={${handler}}`,

    // Conditional: data-condition="count > 0" -> {#if count > 0}
    conditionalBinding: (condition: string): string => `{#if ${condition}}`,

    // Loop: {#each list as item}
    loopBinding: (variable: string, list: string): string =>
      `{#each ${list} as ${variable}}`,

    // Style class binding: class:active={isActive}
    classBinding: (classObj: string): string => `class={${classObj}}`,

    // Method wrapper
    computedWrapper: (name: string, code: string): string =>
      `const ${name} = () => {\n  ${code}\n};`,

    // Imports for Svelte (minimal - uses global APIs)
    requiredImports: (): string[] => {
      return [];
    },
  },

  jquery: {
    // State binding: StateVariable => class property
    stateDeclaration: (name: string, type: string, initial: any): string => {
      const initialValue = JSON.stringify(initial);
      return `private ${name}: ${type} = ${initialValue};`;
    },

    // Template binding: data-binding -> use .text() or .html()
    templateBinding: (variable: string): string => `this.$root.find('[data-${variable}]').text(this.${variable})`,

    // Event binding: data-event="click:handler" -> .on('click', handler)
    eventBinding: (event: string, handler: string): string =>
      `.on('${event}', () => this.${handler}())`,

    // Conditional: data-condition not used - handled in JS
    conditionalBinding: (condition: string): string => `// if (${condition}) { ... }`,

    // Loop: handled via map
    loopBinding: (variable: string, list: string): string =>
      `this.${list}.forEach(${variable} => { ... })`,

    // Style class binding: .addClass() / .removeClass()
    classBinding: (classObj: string): string => `.toggleClass('${classObj}')`,

    // Method wrapper
    computedWrapper: (name: string, code: string): string =>
      `private ${name}() {\n  ${code}\n}`,

    // Imports for jQuery
    requiredImports: (): string[] => {
      return ['jquery'];
    },
  },
};

/**
 * CSS handling strategies
 */
export const cssStrategies = {
  vue: {
    // Vue: embed CSS in <style scoped>
    wrapStyles: (css: string): string =>
      `<style scoped>\n${css}\n</style>`,

    // Vue: CSS variable reference
    cssVariable: (name: string): string => `var(${name})`,

    // Vue: style binding
    styleBinding: (styleObj: string): string => `:style="${styleObj}"`,
  },

  react: {
    // React: inline CSS object or CSS Modules
    wrapStyles: (
      css: string,
      useCssModules: boolean = false
    ): string => {
      if (useCssModules) {
        return `/* styles.module.css */\n${css}`;
      }
      // Convert CSS to inline object
      return convertCssToObject(css);
    },

    cssVariable: (name: string): string => `getCSSVariable('${name}')`,

    styleBinding: (styleObj: string): string => `style={${styleObj}}`,
  },

  angular: {
    // Angular: embed CSS in component decorator or external file
    wrapStyles: (css: string): string =>
      `\nstyles: [\`\n${css}\n\`]`,

    cssVariable: (name: string): string => `var(--${name})`,

    styleBinding: (styleObj: string): string => `[style]="${styleObj}"`,
  },

  svelte: {
    // Svelte: embed CSS in <style> block (automatically scoped)
    wrapStyles: (css: string): string =>
      `\n<style>\n${css}\n</style>`,

    cssVariable: (name: string): string => `var(--${name})`,

    styleBinding: (styleObj: string): string => `style={${styleObj}}`,
  },

  jquery: {
    // jQuery: external CSS file or inline styles
    wrapStyles: (css: string): string =>
      `/* CSS (include via <link> tag or use inline styles) */\n${css}`,

    cssVariable: (name: string): string => `getComputedStyle(document.root).getPropertyValue('--${name}')`,

    styleBinding: (styleObj: string): string => `.css(${styleObj})`,
  },
};

/**
 * Helper functions
 */

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function mapEventToReact(event: string): string {
  const eventMap: Record<string, string> = {
    click: 'onClick',
    submit: 'onSubmit',
    change: 'onChange',
    input: 'onInput',
    focus: 'onFocus',
    blur: 'onBlur',
    keydown: 'onKeyDown',
    keyup: 'onKeyUp',
    mouseenter: 'onMouseEnter',
    mouseleave: 'onMouseLeave',
  };
  return eventMap[event] || `on${capitalize(event)}`;
}

function convertCssToObject(css: string): string {
  // Simple CSS to JavaScript object converter
  // This is a placeholder - real implementation would be more robust
  return `/* CSS Rules (convert to inline styles as needed) */\n${css}`;
}

/**
 * Template transformation rules
 */
export const templateRules = {
  // Remove data-* attributes from final output
  cleanAttributes: (html: string): string => {
    return html.replace(/\s*(data-binding|data-event|data-condition)="[^"]*"/g, '');
  },

  // Convert HTML class attribute to className for React
  htmlToJsx: (html: string): string => {
    return html.replace(/class=/g, 'className=');
  },

  // Fix self-closing tags for JSX
  fixSelfClosing: (html: string): string => {
    const tags = ['img', 'input', 'br', 'hr', 'meta', 'link'];
    tags.forEach((tag) => {
      const regex = new RegExp(`<${tag}([^>]*)>`, 'g');
      html = html.replace(regex, `<${tag}$1 />`);
    });
    return html;
  },
};

/**
 * Dependency mapping
 */
export const dependencyMaps = {
  vue: {
    'fetch|axios': 'axios',
    'dayjs|moment': 'dayjs',
    'lodash': 'lodash-es',
  },
  react: {
    'fetch|axios': 'axios',
    'dayjs|moment': 'dayjs',
    'lodash': 'lodash',
  },
  angular: {
    'fetch|axios': '@angular/common/http',
    'dayjs|moment': 'date-fns',
    'lodash': 'lodash',
  },
  svelte: {
    'fetch|axios': 'axios',
    'dayjs|moment': 'date-fns',
    'lodash': 'lodash-es',
  },
  jquery: {
    'fetch|axios': 'axios',
    'dayjs|moment': 'dayjs',
    'lodash': 'lodash',
  },
};
