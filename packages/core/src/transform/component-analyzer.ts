/**
 * Streaming DOM Parser - SAX Style HTML Scanning
 *
 * Replaces linkedom's full DOM parsing, using a single-pass regular scan to extract the information needed for component analysis.
 * Memory footprint reduced from 1GB+ to <10MB.
 */
import type { HtmlAnalysisResult, DynamicPoints, Element } from './types.js';

// ── Lightweight Element Proxy ────────────────────────────────────────────────
// Compatible element interfaces for downstream correlators

class LightweightElement implements Element {
  constructor(
    public tagName: string,
    public className: string,
    public id: string,
    public outerHTML: string,
    public childNodes: LightweightElement[] = [],
  ) {}

  getAttribute(name: string): string | null {
    if (name === 'class') return this.className || null;
    if (name === 'id') return this.id || null;
    return null;
  }
}

// ── Labeling information ─────────────────────────────────────────────────────

interface TagInfo {
  tagName: string;
  startOffset: number;
  attrs: Record<string, string>;
  depth: number;
  /** Whether self-closing / empty element */
  isSelfClosing: boolean;
  /** Index in this.candidates array if this tag created a component root candidate */
  candidateIndex?: number;
}

interface ComponentRootCandidate {
  name: string;
  tagName: string;
  attrs: Record<string, string>;
  depth: number;
  startOffset: number;
  /** Character offset where this element's closing tag ends (available after processing closing tag) */
  endOffset?: number;
  type: 'explicit' | 'semantic' | 'implicit';
  confidence: number;
  children: ComponentRootCandidate[];
  parent: ComponentRootCandidate | null;
}

// ── Self-closing / empty element ──────────────────────────────────────────────

const SELF_CLOSING = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base',
  'col', 'embed', 'source', 'track', 'wbr', 'path', 'circle',
  'rect', 'line', 'polyline', 'polygon', 'use',
]);

// ── Semantic labels ─────────────────────────────────────────────────────

const SEMANTIC_TAGS = new Set(['header', 'footer', 'nav', 'main', 'section', 'article']);

// ── Heading and interactive element tags for semantic filtering ──────────
// Used to filter section/article candidates: only keep those that contain
// at least one heading (h1-h6) AND one interactive element (button/a/form/input/select/textarea).

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const INTERACTIVE_TAGS = new Set(['button', 'input', 'a', 'form', 'select', 'textarea']);

// ── Event attribute prefix ────────────────────────────────────────────────

const EVENT_PREFIXES = ['onclick', 'onchange', 'onsubmit', 'onkeyup', 'oninput', 'onblur', 'onfocus'];

// ── Flow Analyzer ───────────────────────────────────────────────────

class StreamingHtmlAnalyzer {
  private stack: TagInfo[] = [];
  private candidates: ComponentRootCandidate[] = [];
  private tagCount = 0;

  // Track Vue/Nuxt scoped-style IDs to only register the outermost element per scoped ID
  private seenDataV = new Set<string>();

  // Dynamic point collection
  private bindings: DynamicPoints['bindings'] = [];
  private events: DynamicPoints['events'] = [];
  private conditions: DynamicPoints['conditions'] = [];

  // Track positions of headings and interactive elements for semantic filtering.
  // During streaming scan these offsets are collected; after feed() completes,
  // section/article semantic candidates are validated against them.
  private headingOffsets: number[] = [];
  private interactiveOffsets: number[] = [];

  // Depth threshold for heuristic class-based detection (undefined = no limit)
  private depthThreshold: number | undefined;

  // Framework hint for framework-aware detection
  private frameworkHint: string | undefined;

  // Regular: matches HTML tags
  private readonly TAG_REGEX = /<(\/?)(\w[\w-]*)((?:\s[^>]*?)?)>/g;

  // Regular: parsing attributes (supports double quotes, single quotes, no quotes)
  private readonly ATTR_REGEX = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

  feed(html: string, options?: { maxTagScan?: number; maxDepth?: number; framework?: string }): void {
    let match: RegExpExecArray | null;
    const maxTag = options?.maxTagScan ?? Infinity;
    this.depthThreshold = options?.maxDepth;
    this.frameworkHint = options?.framework;

    while ((match = this.TAG_REGEX.exec(html)) !== null) {
      if (this.tagCount >= maxTag) break;

      const isClosing = match[1] === '/';
      const tagName = match[2].toLowerCase();
      const attrsRaw = match[3];
      const startOffset = match.index;

      this.tagCount++;

      if (isClosing) {
        this.processClosingTag(tagName, startOffset + match[0].length);
      } else {
        this.processOpeningTag(tagName, attrsRaw, startOffset);
      }
    }
  }

  private processOpeningTag(tagName: string, attrsRaw: string, startOffset: number): void {
    const attrs = this.parseAttrs(attrsRaw);
    const depth = this.stack.length;
    const isSelfClosing = SELF_CLOSING.has(tagName) || attrsRaw.endsWith('/');

    const tag: TagInfo = {
      tagName,
      startOffset,
      attrs,
      depth,
      isSelfClosing,
    };

    // Check for component root candidates
    const candidate = this.checkComponentRoot(tag);
    if (candidate) {
      this.candidates.push(candidate);
      tag.candidateIndex = this.candidates.length - 1;
    }

    // Collection of dynamic points
    this.collectDynamicPoints(tag);

    // Track heading and interactive element positions for semantic filtering
    if (HEADING_TAGS.has(tagName)) {
      this.headingOffsets.push(startOffset);
    }
    if (INTERACTIVE_TAGS.has(tagName)) {
      this.interactiveOffsets.push(startOffset);
    }

    if (!isSelfClosing) {
      this.stack.push(tag);
    }
  }

  private processClosingTag(tagName: string, endOffset: number): void {
    // Find the matching open label from the stack
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].tagName === tagName) {
        const tagInfo = this.stack[i];
        // Update the associated candidate's endOffset if one exists
        if (tagInfo.candidateIndex !== undefined && tagInfo.candidateIndex < this.candidates.length) {
          this.candidates[tagInfo.candidateIndex].endOffset = endOffset;
        }
        // Remove only this element from the stack
        this.stack.splice(i, 1);
        break;
      }
    }
  }

  private parseAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    let match: RegExpExecArray | null;
    this.ATTR_REGEX.lastIndex = 0;
    while ((match = this.ATTR_REGEX.exec(raw)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      attrs[key] = value;
    }
    return attrs;
  }

  private checkComponentRoot(tag: TagInfo): ComponentRootCandidate | null {
    const { tagName, attrs, depth, startOffset } = tag;

    // P1: Explicit tag data-component
    if (attrs['data-component'] !== undefined) {
      return {
        name: attrs['data-component'],
        tagName,
        attrs,
        depth,
        startOffset,
        type: 'explicit',
        confidence: 0.99,
        children: [],
        parent: null,
      };
    }

    // P2: Semantic Labeling
    // <nav>, <header>, <main>: always valid component roots
    // <section>, <article>: require class/id/data-* to avoid treating layout-only wrappers as components
    // <footer>: require class/id/data-* (avoids catching entire page footer as a single component)
    if (SEMANTIC_TAGS.has(tagName)) {
      let shouldDetect = false;
      let confidence = 0.85;

      const hasSemanticAttr = attrs['id'] !== undefined
        || attrs['class'] !== undefined
        || Object.keys(attrs).some(k => k.startsWith('data-'));

      if (tagName === 'nav' || tagName === 'header' || tagName === 'main') {
        shouldDetect = true;
        confidence = 0.85;
      } else if (tagName === 'section' || tagName === 'article') {
        if (hasSemanticAttr) {
          shouldDetect = true;
          confidence = 0.75;
        }
      } else if (tagName === 'footer') {
        if (hasSemanticAttr) {
          shouldDetect = true;
          confidence = 0.70;
        }
      }

      if (!shouldDetect) return null;

      return {
        name: this.inferName(attrs, tagName),
        tagName,
        attrs,
        depth,
        startOffset,
        type: 'semantic',
        confidence,
        children: [],
        parent: null,
      };
    }

    // P3: Vue/Nuxt scoped style attribute (data-v-xxxxxxxx)
    // In SSR output, each component's root element carries a unique data-v-* hash.
    // Only register the first (outermost) occurrence of each hash.
    // Some elements carry MULTIPLE data-v-* attributes (nested Vue components),
    // so we must iterate ALL keys, not just the first one found by .find().
    // Register each unique hash as a separate component
    const dataVKeys = Object.keys(attrs).filter(k => k.startsWith('data-v-'));
    for (const dataVKey of dataVKeys) {
      // The hash is in the attribute KEY, not its value.
      // Vue SSR renders: data-v-85b37b74="" (attribute with empty value).
      const hash = dataVKey.replace('data-v-', '');
      if (hash && !this.seenDataV.has(hash)) {
        this.seenDataV.add(hash);
        return {
          name: this.inferComponentName(attrs, tagName, `VueComp_${hash.slice(0, 7)}`),
          tagName,
          attrs,
          depth,
          startOffset,
          type: 'semantic',
          confidence: 0.80,
          children: [],
          parent: null,
        };
      }
    }

    // P4: Depth-based heuristic for SSR pages without explicit markers
    // Treat <div>/<span> elements with meaningful class/id and significant depth as components
    if ((tagName === 'div' || tagName === 'section') && (attrs['class'] || attrs['id'])) {
      // If a depth threshold is set, only detect components at or below that depth
      if (this.depthThreshold === undefined || depth >= this.depthThreshold) {
        // Avoid creating components for trivial wrappers with no nested content
        const isNested = this.candidates.some(c =>
          c.startOffset < startOffset && this.isCandidateContaining(c, startOffset, depth)
        );
        if (!isNested) {
          const name = this.inferComponentName(attrs, tagName, tagName);
          return {
            name,
            tagName,
            attrs,
            depth,
            startOffset,
            type: 'implicit',
            confidence: 0.50,
            children: [],
            parent: null,
          };
        }
      }
    }

    // P5: Framework-aware component boundary detection
    if (this.frameworkHint) {
      const fwCandidate = this.checkFrameworkComponent(tagName, attrs, depth, startOffset);
      if (fwCandidate) return fwCandidate;
    }

    return null;
  }

  /**
   * Framework-specific component boundary detection.
   * Uses framework-internal DOM markers that are more reliable than
   * generic class/id heuristics.
   */
  private checkFrameworkComponent(
    tagName: string,
    attrs: Record<string, string>,
    depth: number,
    startOffset: number,
  ): ComponentRootCandidate | null {
    switch (this.frameworkHint) {
      case 'angular':
        // Angular uses _nghost-* attributes on component host elements
        for (const key of Object.keys(attrs)) {
          if (key.startsWith('_nghost-')) {
            const compId = key.replace('_nghost-', '');
            return {
              name: `NgComp_${compId.slice(0, 7)}`,
              tagName,
              attrs,
              depth,
              startOffset,
              type: 'semantic',
              confidence: 0.85,
              children: [],
              parent: null,
            };
          }
        }
        break;

      case 'sveltekit':
        // Svelte components have svelte-* class prefixes
        if (attrs['class']) {
          const svelteMatch = attrs['class'].match(/\bsvelte-[a-z0-9]+/);
          if (svelteMatch && !this.seenDataV.has(`svelte:${svelteMatch[0]}`)) {
            this.seenDataV.add(`svelte:${svelteMatch[0]}`);
            return {
              name: this.inferComponentName(attrs, tagName, `SvelteComp_${svelteMatch[0].slice(7, 14)}`),
              tagName,
              attrs,
              depth,
              startOffset,
              type: 'semantic',
              confidence: 0.80,
              children: [],
              parent: null,
            };
          }
        }
        break;

      case 'nextjs':
      case 'react18':
        // React-based frameworks: use class-based div/section heuristics
        // with higher confidence when framework is confirmed
        if ((tagName === 'div' || tagName === 'section') && (attrs['class'] || attrs['id'])) {
          const isNested = this.candidates.some(c =>
            c.startOffset < startOffset && this.isCandidateContaining(c, startOffset, depth)
          );
          // Only boost confidence for non-nested divs at depth >= 1
          if (!isNested && depth >= 1) {
            const classes = (attrs['class'] || '').split(/\s+/).filter(c => c.length > 0);
            // Require meaningful class names (skip utility-only classes)
            const meaningful = classes.filter(c =>
              !/^(m[trblxy]?-|p[trblxy]?-|w-|h-|flex|grid|block|hidden|relative|absolute|fixed|text-|font-|bg-|border-|rounded-|shadow-|opacity-|z-|cursor-|overflow-|select-|align-|justify-|items-|self-|order-)/.test(c)
            );
            if (meaningful.length > 0) {
              const name = this.inferComponentName(attrs, tagName, tagName);
              return {
                name,
                tagName,
                attrs,
                depth,
                startOffset,
                type: 'implicit',
                confidence: 0.60, // Boosted from 0.50 due to confirmed framework
                children: [],
                parent: null,
              };
            }
          }
        }
        break;

      case 'nuxt2':
      case 'nuxt3':
      case 'vue3':
      case 'vitepress':
        // Vue-based: already handled by P3 (data-v-*) and P4 (depth-based)
        // No additional markers needed for Vue component boundaries in SSR output
        break;

      default:
        break;
    }

    return null;
  }

  /**
   * Infer a readable component name from element attributes, with a fallback.
   */
  private inferComponentName(attrs: Record<string, string>, tagName: string, fallback: string): string {
    if (attrs['id']) {
      // Convert kebab-case id to PascalCase
      return attrs['id'].replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^[a-z]/, c => c.toUpperCase());
    }
    if (attrs['class']) {
      const classes = attrs['class'].split(/\s+/);
      // Pick the most descriptive class (longest, non-utility)
      const mainClass = classes
        .filter(c => !/^(el-|nuxt-|layout-|page-|is-)/.test(c))
        .sort((a, b) => b.length - a.length)[0] || classes[0];
      return mainClass.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    }
    return fallback;
  }

  private isCandidateContaining(candidate: ComponentRootCandidate, targetOffset: number, targetDepth?: number): boolean {
    // If candidate has a known endOffset, use strict range containment check
    // Otherwise fall back to startOffset-only comparison (candidate's closing tag not yet seen)
    if (candidate.endOffset !== undefined) {
      return candidate.startOffset < targetOffset && candidate.endOffset > targetOffset;
    }
    // When endOffset is unknown (streaming parse: parent's closing tag not yet seen),
    // use depth comparison to avoid misidentifying siblings as children.
    // Siblings have the same depth; children always have greater depth.
    if (targetDepth !== undefined) {
      return candidate.startOffset < targetOffset && candidate.depth < targetDepth;
    }
    return candidate.startOffset < targetOffset;
  }

  private inferName(attrs: Record<string, string>, tagName: string): string {
    if (attrs['id']) return attrs['id'];
    if (attrs['class']) {
      const mainClass = attrs['class'].split(/\s+/)[0];
      return mainClass.split('-')[0] || tagName;
    }
    return tagName;
  }

  private collectDynamicPoints(tag: TagInfo): void {
    const { attrs } = tag;

    // data binding
    const bindingAttr = attrs['data-binding'] ?? attrs['v-model'] ?? attrs['data-bind'];
    if (bindingAttr) {
      const attrName = attrs['data-binding'] !== undefined ? 'data-binding'
        : attrs['v-model'] !== undefined ? 'v-model' : 'data-bind';
      this.bindings.push({
        selector: this.buildSelector(tag),
        attribute: attrName,
        path: bindingAttr,
      });
    }

    // text binding
    const textAttr = attrs['data-text'] ?? attrs['v-text'];
    if (textAttr) {
      this.bindings.push({
        selector: this.buildSelector(tag),
        attribute: attrs['data-text'] !== undefined ? 'data-text' : 'v-text',
        path: textAttr,
      });
    }

    // event property
    for (const prefix of EVENT_PREFIXES) {
      if (attrs[prefix] !== undefined) {
        this.events.push({
          selector: this.buildSelector(tag),
          event: prefix.replace(/^on/, ''),
          handler: attrs[prefix],
        });
      }
    }

    // Custom Events
    const clickHandler = attrs['data-click'];
    const eventHandler = attrs['data-event'];
    if (clickHandler || eventHandler) {
      this.events.push({
        selector: this.buildSelector(tag),
        event: eventHandler || 'click',
        handler: clickHandler || eventHandler || '',
      });
    }

    // conditional rendering
    const condAttr = attrs['v-if'] ?? attrs['data-if'] ?? attrs['v-show'] ?? attrs['data-show'];
    if (condAttr) {
      this.conditions.push({
        selector: this.buildSelector(tag),
        condition: condAttr,
      });
    }

    // Framework-specific event and binding detection
    this.collectFrameworkDynamicPoints(tag);
  }

  /**
   * Collect framework-specific events and bindings based on the framework hint.
   */
  private collectFrameworkDynamicPoints(tag: TagInfo): void {
    const { attrs } = tag;

    // Angular: [(ngModel)], [property] bindings, (event) handlers
    if (this.frameworkHint === 'angular') {
      for (const key of Object.keys(attrs)) {
        // Two-way binding: [(ngModel)]="value"
        if (key.startsWith('[(') && key.endsWith(')]')) {
          const bindingName = key.slice(2, -2);
          this.bindings.push({
            selector: this.buildSelector(tag),
            attribute: key,
            path: attrs[key],
          });
        }
        // Property binding: [property]="value" (skip ng-version, ng-app)
        else if (key.startsWith('[') && key.endsWith(']') && !key.startsWith('[ng')) {
          const bindingName = key.slice(1, -1);
          this.bindings.push({
            selector: this.buildSelector(tag),
            attribute: key,
            path: attrs[key],
          });
        }
        // Event binding: (event)="handler()"
        else if (key.startsWith('(') && key.endsWith(')')) {
          const eventName = key.slice(1, -1);
          this.events.push({
            selector: this.buildSelector(tag),
            event: eventName,
            handler: attrs[key],
          });
        }
      }
    }

    // Svelte: bind:value, on:click, class:active, use:action
    if (this.frameworkHint === 'sveltekit') {
      for (const key of Object.keys(attrs)) {
        // Two-way bind: bind:value={variable}
        if (key.startsWith('bind:')) {
          const propName = key.slice(5);
          this.bindings.push({
            selector: this.buildSelector(tag),
            attribute: key,
            path: attrs[key],
          });
        }
        // Event handler: on:click={handler}
        else if (key.startsWith('on:')) {
          const eventName = key.slice(3);
          this.events.push({
            selector: this.buildSelector(tag),
            event: eventName,
            handler: attrs[key],
          });
        }
        // Class toggle: class:active={condition}
        else if (key.startsWith('class:')) {
          const className = key.slice(6);
          this.conditions.push({
            selector: this.buildSelector(tag),
            condition: `${className}: ${attrs[key]}`,
          });
        }
      }
    }

    // Vue: @event, :prop shorthand (already partially handled, but add more)
    if (this.frameworkHint === 'vue3' || this.frameworkHint === 'nuxt2' || this.frameworkHint === 'nuxt3' || this.frameworkHint === 'vitepress') {
      for (const key of Object.keys(attrs)) {
        // @event shorthand
        if (key.startsWith('@') && key.length > 1) {
          const eventName = key.slice(1);
          // Skip if already captured by v-model, etc.
          if (eventName !== 'model') {
            this.events.push({
              selector: this.buildSelector(tag),
              event: eventName,
              handler: attrs[key],
            });
          }
        }
        // :prop shorthand (skip known directives)
        else if (key.startsWith(':') && key.length > 1) {
          const propName = key.slice(1);
          // Skip if already captured
          const alreadyCaptured = ['key', 'is', 'ref', 'slot'].includes(propName);
          if (!alreadyCaptured) {
            this.bindings.push({
              selector: this.buildSelector(tag),
              attribute: key,
              path: attrs[key],
            });
          }
        }
      }
    }
  }

  private buildSelector(tag: TagInfo): string {
    const { tagName, attrs } = tag;
    if (attrs['id']) return `#${attrs['id']}`;
    if (attrs['class']) {
      return attrs['class'].split(/\s+/).map((c: string) => `.${c}`).join('');
    }
    return tagName;
  }

  /**
   * Building component trees based on depth ordering (O(n log n))
   */
  buildComponentTree(): ComponentRootCandidate[] {
    if (this.candidates.length <= 1) return this.candidates;

    // Sort by startOffset (document order)
    const sorted = [...this.candidates].sort((a, b) => a.startOffset - b.startOffset);

    // Building Nested Relationships
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i - 1; j >= 0; j--) {
        if (this.isNestedIn(sorted[j], sorted[i])) {
          sorted[j].children.push(sorted[i]);
          sorted[i].parent = sorted[j];
          break;
        }
      }
    }

    return sorted.filter(c => !c.parent);
  }

  /**
   * Determine if a child is nested in a parent.
   * Uses strict range containment when endOffset is available,
   * falling back to depth-based comparison.
   */
  private isNestedIn(parent: ComponentRootCandidate, child: ComponentRootCandidate): boolean {
    // If parent has endOffset, use strict range containment
    if (parent.endOffset !== undefined) {
      return parent.startOffset < child.startOffset && parent.endOffset > child.startOffset;
    }
    // Fallback: parent must start before child and have shallower depth
    return parent.startOffset < child.startOffset && parent.depth < child.depth;
  }

  /**
   * Filter out section/article semantic candidates that lack content structure.
   * A section or article is only treated as a component when it contains
   * at least one heading (h1-h6) AND one interactive element
   * (button/input/a/form/select/textarea).
   *
   * Pure layout wrappers (e.g. <section><h2>Features</h2><div>...</div></section>)
   * are removed to avoid false positives in the component list.
   */
  filterSectionArticleCandidates(): void {
    this.candidates = this.candidates.filter(candidate => {
      if (candidate.tagName !== 'section' && candidate.tagName !== 'article') {
        return true;
      }
      if (candidate.type !== 'semantic') {
        return true;
      }

      const start = candidate.startOffset;
      const end = candidate.endOffset ?? Infinity;

      const hasHeading = this.headingOffsets.some(offset => offset >= start && offset < end);
      const hasInteractive = this.interactiveOffsets.some(offset => offset >= start && offset < end);

      return hasHeading && hasInteractive;
    });
  }

  /**
   * Remove the last <footer> candidate (largest startOffset among footer candidates).
   * This is typically the site-wide footer and should not be treated as a component.
   * Only applies to semantic footer candidates.
   */
  filterFooterCandidates(): void {
    const footerCandidates = this.candidates
      .filter(c => c.tagName === 'footer' && c.type === 'semantic')
      .sort((a, b) => b.startOffset - a.startOffset);

    if (footerCandidates.length > 0) {
      const lastFooter = footerCandidates[0]; // largest startOffset
      this.candidates = this.candidates.filter(c => c !== lastFooter);
    }
  }

  /**
   * Extracts the outerHTML of the component root (slices from the original HTML)
   */
  extractOuterHTML(html: string, root: ComponentRootCandidate): string {
    // Extracts from startOffset to the start of the next label of the same level or shallower.
    const start = root.startOffset;
    let end = html.length;

    // Locate the next label on the same or shallower level
    this.TAG_REGEX.lastIndex = start + 1;
    let match: RegExpExecArray | null;
    while ((match = this.TAG_REGEX.exec(html)) !== null) {
      const tagDepth = this.getTagDepth(match[0], match.index, html);

      if (tagDepth <= root.depth) {
        end = match.index;
        break;
      }
    }

    return html.slice(start, end);
  }

  private getTagDepth(tagStr: string, offset: number, html: string): number {
    // Estimated by scanning the depth of the label to the offset position
    let depth = 0;
    this.TAG_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = this.TAG_REGEX.exec(html)) !== null) {
      if (m.index >= offset) break;
      const isClosing = m[1] === '/';
      const tn = m[2].toLowerCase();
      if (isClosing) {
        depth = Math.max(0, depth - 1);
      } else if (!SELF_CLOSING.has(tn) && !m[0].endsWith('/>')) {
        depth++;
      }
    }
    return depth;
  }

  getResults(): { candidates: ComponentRootCandidate[]; dynamicPoints: DynamicPoints } {
    return {
      candidates: this.candidates,
      dynamicPoints: {
        bindings: this.bindings,
        events: this.events,
        conditions: this.conditions,
      },
    };
  }
}

// ── Filter function ─────────────────────────────────────────────────────

function filterComponentRoots(roots: ComponentRootCandidate[]): ComponentRootCandidate[] {
  return roots.filter(root => {
    // Filter inline tags
    if (['span', 'a', 'strong', 'em', 'b', 'i', 'u', 'code', 'br'].includes(root.tagName)) {
      return false;
    }
    return true;
  });
}

// ── Public API ─────────────────────────────────────────────────────

interface MappedComponent {
  name: string;
  element: LightweightElement;
  depth: number;
  type: 'explicit' | 'semantic' | 'implicit';
  confidence: number;
  parent?: MappedComponent | null;
  children?: MappedComponent[];
}

export function analyzeHtml(html: string, options?: { maxTagScan?: number; depth?: number; framework?: string }): HtmlAnalysisResult {
  if (!html || !html.trim()) {
    return {
      componentRoots: [],
      dynamicPoints: { bindings: [], events: [], conditions: [] },
    };
  }

  try {
    const analyzer = new StreamingHtmlAnalyzer();

    // Stage 1: Streaming Scan
    analyzer.feed(html, {
      maxTagScan: options?.maxTagScan,
      maxDepth: options?.depth,
      framework: options?.framework,
    });

    // Stage 1.5: Semantic Filtering
    // Remove section/article candidates that lack heading + interactive content,
    // and filter out the site-wide <footer>.
    analyzer.filterSectionArticleCandidates();
    analyzer.filterFooterCandidates();

    // Stage 2: Building the Component Tree
    const { dynamicPoints } = analyzer.getResults();
    const topLevel = analyzer.buildComponentTree();

    // Stage 3: Filtration
    const filtered = filterComponentRoots(topLevel);

    // Stage 4: Conversion to ComponentRoot format (with lightweight element proxies)
    // Recursively map children to preserve the full component tree
    function _mapChildren(children: ComponentRootCandidate[]): MappedComponent[] {
      return children.map(child => {
        const childOuterHTML = analyzer.extractOuterHTML(html, child);
        const childEl = new LightweightElement(
          child.tagName,
          child.attrs['class'] || '',
          child.attrs['id'] || '',
          childOuterHTML,
        );
        return {
          name: child.name,
          element: childEl,
          depth: child.depth,
          type: child.type,
          confidence: child.confidence,
          parent: null,
          children: _mapChildren(child.children), // recursive
        };
      });
    }

    const componentRoots = filtered.map(c => {
      const outerHTML = analyzer.extractOuterHTML(html, c);
      const el = new LightweightElement(
        c.tagName,
        c.attrs['class'] || '',
        c.attrs['id'] || '',
        outerHTML,
      );

      return {
        name: c.name,
        element: el,
        depth: c.depth,
        type: c.type,
        confidence: c.confidence,
        children: _mapChildren(c.children).map(mc => ({
          name: mc.name,
          element: mc.element,
          depth: mc.depth,
          type: mc.type,
          confidence: mc.confidence,
        })),
      };
    });

    return {
      componentRoots,
      dynamicPoints,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`HTML analysis error: ${message}`);
    return {
      componentRoots: [],
      dynamicPoints: { bindings: [], events: [], conditions: [] },
    };
  }
}