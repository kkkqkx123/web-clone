import { parseHTML } from 'linkedom';
import type { HtmlAnalysisResult } from './types.js';

export function analyzeHtml(html: string, options?: any): HtmlAnalysisResult {
  try {
    const { document } = parseHTML(html);
    // Pass undefined depth when not specified (no limit)
    const componentRoots = findComponentRoots(document, options?.depth);
    const dynamicPoints = findDynamicPoints(document);
    const nestedComponents = detectNestedComponents(componentRoots);

    return { componentRoots: nestedComponents, dynamicPoints };
  } catch (err: any) {
    console.warn(`HTML analysis error: ${err.message}`);
    return { componentRoots: [], dynamicPoints: { bindings: [], events: [], conditions: [] } };
  }
}

function findComponentRoots(doc: any, maxDepth?: number) {
  const roots: any[] = [];
  const processed = new WeakSet();

  // P1: Explicit markers
  doc.querySelectorAll('[data-component]').forEach((el: any) => {
    if (processed.has(el)) return;
    processed.add(el);
    roots.push({
      name: el.getAttribute('data-component'),
      element: el,
      depth: getElementDepth(el),
      type: 'explicit',
      confidence: 0.99,
      parent: null,
      children: []
    });
  });

  // P2: Semantic HTML5 tags
  const semanticTags = ['header', 'footer', 'nav', 'main', 'section', 'article'];
  semanticTags.forEach(tag => {
    doc.querySelectorAll(tag).forEach((el: any) => {
      if (processed.has(el)) return;
      const isNested = roots.some(r => r.element.contains(el));
      if (!isNested) {
        processed.add(el);
        roots.push({
          name: inferComponentName(el),
          element: el,
          depth: getElementDepth(el),
          type: 'semantic',
          confidence: 0.85,
          parent: null,
          children: []
        });
      }
    });
  });

  // P3: Depth-based (only apply when maxDepth explicitly specified)
  const depthRoots: any[] = [];

  if (maxDepth !== undefined) {
    doc.querySelectorAll('*').forEach((el: any) => {
      const depth = getElementDepth(el);
      if (depth > maxDepth && !processed.has(el)) {
        // Avoid redundant components
        const isChild = roots.some(r => r.element.contains(el));
        if (!isChild && !depthRoots.some(r => r.element.contains(el))) {
          const name = inferComponentName(el) || `Component_${roots.length + depthRoots.length + 1}`;
          depthRoots.push({
            name,
            element: el,
            depth,
            type: 'implicit',
            confidence: Math.max(0.5, 0.65 - (depth - maxDepth) * 0.05), // Decrease confidence for deeper elements
            parent: null,
            children: []
          });
          processed.add(el);
        }
      }
    });
  }

  return [...roots, ...depthRoots];
}

function detectNestedComponents(roots: any[]): any[] {
  // Detect parent-child relationships
  roots.forEach(root => {
    roots.forEach(other => {
      if (root !== other && root.element.contains(other.element)) {
        // Check if it's a direct child or nested deeper
        const intermediateParent = roots.find(r =>
          r !== root && r !== other &&
          root.element.contains(r.element) &&
          r.element.contains(other.element)
        );
        if (!intermediateParent) {
          root.children.push(other);
          other.parent = root;
        }
      }
    });
  });

  // Return only top-level roots
  return roots.filter(r => !r.parent);
}

function findDynamicPoints(doc: any) {
  const bindings: any[] = [];
  const events: any[] = [];
  const conditions: any[] = [];

  // Look for data-binding attributes and v-model, data-bind patterns
  doc.querySelectorAll('[data-binding], [v-model], [data-bind]').forEach((el: any) => {
    const path = el.getAttribute('data-binding') ||
                 el.getAttribute('v-model') ||
                 el.getAttribute('data-bind');
    bindings.push({
      selector: getElementSelector(el),
      attribute: el.getAttribute('data-binding') ? 'data-binding' :
                 el.getAttribute('v-model') ? 'v-model' : 'data-bind',
      path,
      type: 'input'
    });
  });

  // Look for text bindings
  doc.querySelectorAll('[data-text], [v-text]').forEach((el: any) => {
    const path = el.getAttribute('data-text') || el.getAttribute('v-text');
    bindings.push({
      selector: getElementSelector(el),
      attribute: el.getAttribute('data-text') ? 'data-text' : 'v-text',
      path,
      type: 'text'
    });
  });

  // Look for event attributes (onclick, onchange, etc.)
  const eventAttrs = ['onclick', 'onchange', 'onsubmit', 'onkeyup', 'oninput', 'onblur', 'onfocus'];
  eventAttrs.forEach(attr => {
    doc.querySelectorAll(`[${attr}]`).forEach((el: any) => {
      events.push({
        selector: getElementSelector(el),
        event: attr.replace(/^on/, ''),
        handler: el.getAttribute(attr),
        nativeEvent: true
      });
    });
  });

  // Look for data-click and data-event patterns
  doc.querySelectorAll('[data-click], [data-event]').forEach((el: any) => {
    const event = el.getAttribute('data-event') || 'click';
    const handler = el.getAttribute('data-click') || el.getAttribute('data-event');
    if (handler) {
      events.push({
        selector: getElementSelector(el),
        event,
        handler,
        customEvent: true
      });
    }
  });

  // Look for conditional attributes (v-if, data-if, etc.)
  doc.querySelectorAll('[v-if], [data-if], [v-show], [data-show]').forEach((el: any) => {
    const condition = el.getAttribute('v-if') ||
                      el.getAttribute('data-if') ||
                      el.getAttribute('v-show') ||
                      el.getAttribute('data-show');
    conditions.push({
      selector: getElementSelector(el),
      type: el.getAttribute('v-if') || el.getAttribute('data-if') ? 'if' : 'show',
      expression: condition
    });
  });

  return { bindings, events, conditions };
}

function getElementDepth(el: any): number {
  let depth = 0;
  let current = el;
  while (current.parentElement) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

function getElementSelector(el: any): string {
  if (el.id) return `#${el.id}`;
  if (el.className) {
    const classes = el.className.split(' ').filter((c: string) => c);
    return classes.map((c: string) => `.${c}`).join('');
  }
  return el.tagName.toLowerCase();
}

function inferComponentName(el: any): string {
  if (el.id) return el.id;
  if (el.className) {
    const classes = el.className.split(' ');
    const mainClass = classes[0];
    return mainClass.split('-')[0] || 'Component';
  }
  return el.tagName.toLowerCase();
}
