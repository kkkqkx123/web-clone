import type { CorrelatedComponent } from './types.js';
import type { ComponentSpec, ComponentManifest } from '../types.js';

export function generateComponentStructure(
  correlated: Map<string, CorrelatedComponent>,
  componentHierarchy?: Map<string, string[]>
): Map<string, ComponentSpec> {
  const components = new Map<string, ComponentSpec>();

  correlated.forEach((comp, name) => {
    const manifest = buildManifest(comp);
    const children = componentHierarchy?.get(name) || [];

    const spec: ComponentSpec = {
      name: comp.name,
      type: comp.type,
      children,
      template: comp.template,
      styles: comp.styles,
      logic: comp.logic,
      matchConfidence: comp.matchConfidence,
      manifest
    };

    components.set(name, spec);
  });

  return components;
}

function buildManifest(comp: CorrelatedComponent): ComponentManifest {
  const priority = calculatePriority(comp);
  const effort = estimateEffort(comp);
  const eventCount = comp.logic?.events?.length || 0;

  return {
    name: comp.name,
    type: comp.type,
    path: `components/${comp.name}`,
    children: [],
    state: buildStateMap(comp.logic?.state || []),
    events: buildEventMap(comp.logic?.events || []),
    migration: {
      priority,
      effort,
      suggestions: generateSuggestions(comp),
      todos: enrichTodos(comp)
    }
  };
}

function calculatePriority(comp: CorrelatedComponent): 'high' | 'medium' | 'low' {
  if (comp.type === 'stateful' && (comp.logic?.state?.length || 0) > 3) return 'high';
  if (comp.type === 'stateful') return 'medium';
  if (comp.type === 'presentational') return 'medium';
  return 'low';
}

function estimateEffort(comp: CorrelatedComponent): string {
  const stateCount = comp.logic?.state?.length || 0;
  const methodCount = comp.logic?.methods?.length || 0;
  const eventCount = comp.logic?.events?.length || 0;
  const complexity = stateCount * 0.5 + methodCount * 0.3 + eventCount * 0.2;

  if (complexity <= 1) return '1h';
  if (complexity <= 2.5) return '2h';
  if (complexity <= 5) return '4h';
  return '8h+';
}

function buildStateMap(stateVars: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  stateVars.forEach(sv => {
    map[sv.name] = {
      type: sv.type,
      initial: sv.initial,
      bindings: sv.bindings || [],
      mutators: sv.mutators || [],
      confidence: Math.round(sv.confidence * 100) / 100
    };
  });
  return map;
}

function buildEventMap(events: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  let index = 0;
  events.forEach(event => {
    const key = event.handler || `event_${index++}`;
    map[key] = {
      event: event.event,
      handler: event.handler,
      selector: event.selector,
      nativeEvent: event.nativeEvent || false
    };
  });
  return map;
}

function enrichTodos(comp: CorrelatedComponent) {
  const todos = comp.logic?.todos || [];
  const enriched = todos.map((t: any) => ({
    ...t,
    context: `In ${comp.type} component '${comp.name}'`
  }));

  // Add confidence-based TODOs
  if (comp.matchConfidence < 0.6) {
    enriched.push({
      type: 'low_confidence',
      description: `Low match confidence (${Math.round(comp.matchConfidence * 100)}%) - manual review recommended`,
      severity: 'warning',
      context: `Component '${comp.name}' matching`
    });
  }

  return enriched;
}

function generateSuggestions(comp: CorrelatedComponent): string[] {
  const suggestions: string[] = [];

  if (comp.type === 'stateful') {
    const stateCount = comp.logic?.state?.length || 0;
    if (stateCount > 0) {
      suggestions.push(`Extract ${stateCount} state variable(s) to reactive references`);
    }
    suggestions.push('Map event handlers to component methods');
    suggestions.push('Consider using computed properties for derived state');
  }

  if (comp.type === 'presentational') {
    suggestions.push('Convert to pure functional component (no side effects)');
    suggestions.push('Use prop-drilling or context API for data flow');
  }

  const eventCount = comp.logic?.events?.length || 0;
  if (eventCount > 3) {
    suggestions.push(`Consolidate ${eventCount} event handlers into fewer methods`);
  }

  if (comp.logic?.todos && comp.logic.todos.length > 0) {
    suggestions.push(`Address ${comp.logic.todos.length} migration TODO(s) before finalizing`);
  }

  return suggestions;
}
