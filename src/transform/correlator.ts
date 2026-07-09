import type { HtmlAnalysisResult, CssAnalysisResult, JsAnalysisResult, CorrelatedComponent } from './types.js';

export function correlateComponents(
  html: HtmlAnalysisResult,
  css: CssAnalysisResult,
  js: JsAnalysisResult
): Map<string, CorrelatedComponent> {
  const components = new Map<string, CorrelatedComponent>();

  function processRoot(root: any) {
    const styles = matchStyles(root, css);
    const logic = matchLogic(root, js);
    const componentType = inferComponentType(logic);
    const logicConfidence = calculateLogicConfidence(logic);

    const comp: CorrelatedComponent = {
      name: root.name,
      type: componentType,
      template: getOuterHtml(root.element),
      styles: styles.css,
      logic,
      matchConfidence: (root.confidence + styles.confidence + logicConfidence) / 3
    };

    components.set(root.name, comp);

    // Process nested children
    if (root.children && Array.isArray(root.children)) {
      root.children.forEach((child: any) => processRoot(child));
    }
  }

  html.componentRoots.forEach(root => processRoot(root));

  return components;
}

function matchStyles(root: any, css: CssAnalysisResult) {
  const classes = getElementClasses(root.element);
  const id = root.element.id;
  const tag = root.element.tagName?.toLowerCase() || '';
  const matched: any[] = [];
  let confidence = 0;

  // Match by class names (BEM support - enhanced)
  classes.forEach(cls => {
    if (css.componentStyles[cls]) {
      matched.push(...css.componentStyles[cls]);
      confidence += 0.3;
    }
    // Check for BEM block-related classes (supports nested patterns)
    const blockName = cls.split('__')[0].split('--')[0];
    if (blockName !== cls && css.componentStyles[blockName]) {
      matched.push(...css.componentStyles[blockName]);
      confidence += 0.2;
    }
  });

  // Match by ID (if present)
  if (id && css.componentStyles[id]) {
    matched.push(...css.componentStyles[id]);
    confidence += 0.2;
  } else if (id) {
    // Check ID-based CSS
    const idStyles = Object.entries(css.componentStyles).find(([key]) => key === id);
    if (idStyles) {
      matched.push(...idStyles[1]);
      confidence += 0.2;
    }
  }

  // Match by tag name
  if (css.componentStyles[tag]) {
    matched.push(...css.componentStyles[tag]);
    confidence += 0.1;
  }

  // Match by CSS descendant/child combinators
  const selectors = Object.keys(css.componentStyles);
  selectors.forEach(sel => {
    if ((sel.includes(tag) || classes.some(c => sel.includes(c))) && !matched.includes(css.componentStyles[sel])) {
      matched.push(...css.componentStyles[sel]);
      confidence += 0.15;
    }
  });

  // Check for dynamic style indicators
  const dynamicMatches = css.dynamicStyles?.filter(ds => {
    const dsClasses = ds.selector.match(/\.([a-z0-9_-]+)/gi) || [];
    return classes.some(c => dsClasses.some(dc => dc.includes(c))) ||
           (id && ds.selector.includes(`#${id}`));
  }) || [];

  if (dynamicMatches.length > 0) {
    confidence += 0.1;
  }

  return {
    css: Array.from(new Set(matched)).join('\n'),
    confidence: Math.min(1, confidence)
  };
}

function matchLogic(root: any, js: JsAnalysisResult) {
  const refs = getElementRefs(root.element);

  if (js.methods.length === 0 && js.state.length === 0 && js.events.length === 0) {
    return null;
  }

  // Try to match state/methods/events by element references
  const matchedState = js.state.filter(s => {
    return refs.some(ref => {
      const refName = ref.replace(/[.#]/, '').toLowerCase();
      return s.name.toLowerCase().includes(refName) || refName.includes(s.name.toLowerCase());
    });
  });

  const matchedMethods = js.methods.filter(m => {
    return refs.some(ref => {
      const refName = ref.replace(/[.#]/, '').toLowerCase();
      return m.name.toLowerCase().includes(refName) || refName.includes(m.name.toLowerCase());
    });
  });

  const matchedEvents = js.events.filter(e => {
    return refs.some(ref => {
      const refName = ref.replace(/[.#]/, '').toLowerCase();
      return e.selector.includes(refName) || refName.includes(e.selector.replace(/[.#]/, '').toLowerCase());
    });
  });

  return {
    state: matchedState.length > 0 ? matchedState : js.state,
    methods: matchedMethods.length > 0 ? matchedMethods : js.methods,
    events: matchedEvents.length > 0 ? matchedEvents : js.events,
    todos: js.todos
  };
}

function inferComponentType(logic: any): 'stateful' | 'presentational' | 'unknown' {
  if (!logic) return 'unknown';

  const hasState = logic.state && logic.state.length > 0;
  const hasEvents = logic.events && logic.events.length > 0;
  const hasMethods = logic.methods && logic.methods.length > 0;

  if (hasState && (hasEvents || hasMethods)) return 'stateful';
  if (hasState || hasEvents || hasMethods) return 'presentational';
  return 'unknown';
}

function calculateLogicConfidence(logic: any): number {
  if (!logic) return 0.3;

  let confidence = 0.5;

  // State variables increase confidence
  const stateCount = logic.state?.length || 0;
  confidence += Math.min(0.2, stateCount * 0.1);

  // Methods increase confidence
  const methodCount = logic.methods?.length || 0;
  confidence += Math.min(0.15, methodCount * 0.075);

  // Events increase confidence
  const eventCount = logic.events?.length || 0;
  confidence += Math.min(0.15, eventCount * 0.075);

  return Math.min(1, confidence);
}

function getElementClasses(el: any): string[] {
  if (!el.className) return [];
  return el.className.split(' ').filter((c: string) => c && c.length > 0);
}

function getElementRefs(el: any): string[] {
  const refs: string[] = [];
  if (el.id) refs.push(`#${el.id}`);
  const classes = getElementClasses(el);
  refs.push(...classes.map(c => `.${c}`));
  if (el.tagName) refs.push(el.tagName.toLowerCase());
  return refs;
}

function getOuterHtml(el: any): string {
  try {
    return el.outerHTML || el.toString();
  } catch {
    return '<div><!-- Unable to serialize --></div>';
  }
}

