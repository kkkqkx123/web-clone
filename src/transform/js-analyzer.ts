import { createRequire } from 'node:module';
import * as parser from '@babel/parser';
import type { JsAnalysisResult, DomRef } from './types.js';
import type { StateVariable, MethodSpec, EventBinding, MigrationTodo } from '../types.js';

const require = createRequire(import.meta.url);
const traverse = require('@babel/traverse').default;

// Grading Strategy Thresholds
const FULL_PARSE_LIMIT = 100 * 1024;        // < 100KB: Full Babel Explanation
const FILTERED_PARSE_LIMIT = 1024 * 1024;   // < 1MB: Babel parsing after prefiltering
const TRUNCATED_PARSE_LIMIT = 5 * 1024 * 1024; // < 5MB: Babel parsing after truncation

export function analyzeJavaScript(js: string, options?: any): JsAnalysisResult {
  const result: JsAnalysisResult = {
    state: [],
    methods: [],
    events: [],
    refs: [],
    lifecycles: {},
    todos: []
  };

  if (!js.trim()) return result;

  const size = js.length;

  // Hierarchical strategy: choose different parsing methods according to file size
  if (size <= FULL_PARSE_LIMIT) {
    // < 100KB: Full Babel Explanation
    return parseWithBabel(js, result);
  } else if (size <= FILTERED_PARSE_LIMIT) {
    // 100KB - 1MB: Quick Scan + Babel Parsing
    const quick = quickScanJs(js);
    result.state = quick.state.map(n => ({
      name: n,
      type: 'unknown',
      initial: undefined,
      bindings: [],
      mutators: [],
      confidence: 0.3
    }));
    result.methods = quick.handlers.map(n => ({
      name: n,
      kind: 'handler' as const,
      code: '',
      parameters: [],
      sideEffects: []
    }));
    // Supplemental Babel Analysis
    const babelResult = parseWithBabel(js, emptyResult());
    result.state = mergeStateDeduped(result.state, babelResult.state);
    result.methods = mergeMethodsDeduped(result.methods, babelResult.methods);
    result.events = babelResult.events;
    result.refs = babelResult.refs;
    result.lifecycles = babelResult.lifecycles;
    result.todos.push(...babelResult.todos);
    return result;
  } else if (size <= TRUNCATED_PARSE_LIMIT) {
    // 1MB - 5MB: Babel parsing after truncation
    console.warn(`⚠ JS truncated: ${fmt(size)} → ${fmt(FULL_PARSE_LIMIT)}`);
    // Quick scan first to get the full amount of information
    const quick = quickScanJs(js);
    result.state = quick.state.map(n => ({
      name: n,
      type: 'unknown',
      initial: undefined,
      bindings: [],
      mutators: [],
      confidence: 0.3
    }));
    result.methods = quick.handlers.map(n => ({
      name: n,
      kind: 'handler' as const,
      code: '',
      parameters: [],
      sideEffects: []
    }));
    // Truncate the first 500KB for Babel parsing.
    const truncated = js.slice(0, FULL_PARSE_LIMIT * 5);
    const babelResult = parseWithBabel(truncated, emptyResult());
    result.state = mergeStateDeduped(result.state, babelResult.state);
    result.methods = mergeMethodsDeduped(result.methods, babelResult.methods);
    result.events = babelResult.events;
    result.refs = babelResult.refs;
    result.lifecycles = babelResult.lifecycles;
    result.todos.push(...babelResult.todos);
    result.todos.push({
      type: 'unknown_pattern',
      description: `JS truncated: ${fmt(size)} parsed, full size ${fmt(size)}`,
      severity: 'info'
    });
    return result;
  } else {
    // > 5MB: regular fast scan only
    console.warn(`⚠ JS too large (${fmt(size)}), using quick scan only`);
    const quick = quickScanJs(js);
    result.state = quick.state.map(n => ({
      name: n,
      type: 'unknown',
      initial: undefined,
      bindings: [],
      mutators: [],
      confidence: 0.3
    }));
    result.methods = quick.handlers.map(n => ({
      name: n,
      kind: 'handler' as const,
      code: '',
      parameters: [],
      sideEffects: []
    }));
    result.todos.push({
      type: 'unknown_pattern',
      description: `JS too large (${fmt(size)}), quick scan only — results may be incomplete`,
      severity: 'warning'
    });
    return result;
  }
}

function fmt(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][i]}`;
}

function emptyResult(): JsAnalysisResult {
  return { state: [], methods: [], events: [], refs: [], lifecycles: {}, todos: [] };
}

function mergeStateDeduped(existing: StateVariable[], incoming: StateVariable[]): StateVariable[] {
  const names = new Set(existing.map(s => s.name));
  return [...existing, ...incoming.filter(s => !names.has(s.name))];
}

function mergeMethodsDeduped(existing: MethodSpec[], incoming: MethodSpec[]): MethodSpec[] {
  const names = new Set(existing.map(m => m.name));
  return [...existing, ...incoming.filter(m => !names.has(m.name))];
}

/**
 * Quick scan JS using regex patterns — lightweight, no Babel.
 */
function quickScanJs(js: string): { state: string[]; handlers: string[] } {
  const state: string[] = [];
  const handlers: string[] = [];

  // A quick scan of variable declarations
  const statePattern = /\b(var|let|const)\s+(\w+)\s*=\s*(['"`]|\d+|true|false|null|undefined|\{|\[)/g;
  let match;
  while ((match = statePattern.exec(js)) !== null) {
    const name = match[2];
    if (isLikelyState(name) && !state.includes(name)) {
      state.push(name);
    }
  }

  // 快速扫描函数定义
  const handlerPattern = /\b(?:function\s+(\w+)|(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))\s*[({]/g;
  while ((match = handlerPattern.exec(js)) !== null) {
    const name = match[1] || match[2];
    if (name && isLikelyHandler(name) && !handlers.includes(name)) {
      handlers.push(name);
    }
  }

  return { state, handlers };
}

/**
 * Full Babel-based AST parsing.
 */
function parseWithBabel(js: string, result: JsAnalysisResult): JsAnalysisResult {
  try {
    const ast = parser.parse(js, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true
    });

    const stateVariables = new Map<string, StateVariable>();
    const methodMap = new Map<string, MethodSpec>();
    const eventListeners: EventBinding[] = [];
    const domRefs: DomRef[] = [];

    traverse(ast, {
      VariableDeclarator(path: any) {
        const sv = extractStateVariable(path, js);
        if (sv) stateVariables.set(sv.name, sv);
      },

      ObjectProperty(path: any) {
        // Detect object properties that look like state (e.g., data: { count: 0 })
        const sv = extractObjectPropertyState(path, js);
        if (sv) stateVariables.set(sv.name, sv);
      },

      FunctionDeclaration(path: any) {
        const method = extractMethod(path, js);
        if (method) {
          methodMap.set(method.name, method);
          if (isLifecycleMethod(method.name)) {
            result.lifecycles[method.name] = method;
          }
        }
      },

      ArrowFunctionExpression(path: any) {
        const method = extractArrowFunction(path, js);
        if (method) methodMap.set(method.name, method);
      },

      AssignmentExpression(path: any) {
        // Detect state mutations like state.count = 5
        const stateRef = detectStateMutation(path, js);
        if (stateRef && stateVariables.has(stateRef.varName)) {
          const sv = stateVariables.get(stateRef.varName)!;
          sv.mutators.push(stateRef.type);
        }
      },

      CallExpression(path: any) {
        // Try to extract event listeners
        const event = tryExtractEvent(path, js);
        if (event) eventListeners.push(event);

        // Try to extract DOM references
        const ref = tryExtractDomRef(path, js);
        if (ref) domRefs.push(ref);
      }
    });

    result.state = Array.from(stateVariables.values());
    result.methods = Array.from(methodMap.values());
    result.events = eventListeners;
    result.refs = domRefs;
  } catch (err: any) {
    result.todos.push({
      type: 'unknown_pattern',
      description: `JS parsing error: ${err.message}`,
      severity: 'critical'
    });
  }

  return result;
}

function extractStateVariable(path: any, js: string): StateVariable | null {
  const { id, init } = path.node;
  if (!id || id.type !== 'Identifier') return null;

  const name = id.name;
  if (!isLikelyState(name)) return null;

  return {
    name,
    type: inferType(init),
    initial: inferInitialValue(init),
    bindings: [],
    mutators: [],
    confidence: scoreAsState(name)
  };
}

function extractObjectPropertyState(path: any, js: string): StateVariable | null {
  const { key, value } = path.node;
  if (!key || key.type !== 'Identifier') return null;

  const name = key.name;
  if (!isLikelyState(name)) return null;

  return {
    name,
    type: inferType(value),
    initial: inferInitialValue(value),
    bindings: [],
    mutators: [],
    confidence: scoreAsState(name) - 0.1 // Slightly lower for object properties
  };
}

function extractMethod(path: any, js: string): MethodSpec | null {
  const name = path.node.id?.name;
  if (!name) return null;

  const isHandler = isLikelyHandler(name);
  const isLifecycle = isLifecycleMethod(name);

  if (!isHandler && !isLifecycle) return null;

  return {
    name,
    kind: isLifecycle ? 'lifecycle' : 'handler',
    code: '', // Simplified
    parameters: path.node.params.map((p: any) => p.name || 'arg'),
    sideEffects: []
  };
}

function extractArrowFunction(path: any, js: string): MethodSpec | null {
  // Try to get function name from assignment or object property
  let funcName: string | null = null;

  if (path.parent?.type === 'VariableDeclarator' && path.parent.id?.name) {
    funcName = path.parent.id.name;
  } else if (path.parent?.type === 'ObjectProperty' && path.parent.key?.name) {
    funcName = path.parent.key.name;
  }

  if (!funcName || (!isLikelyHandler(funcName) && !isLifecycleMethod(funcName))) {
    return null;
  }

  return {
    name: funcName,
    kind: isLifecycleMethod(funcName) ? 'lifecycle' : 'handler',
    code: '',
    parameters: path.node.params.map((p: any) => p.name || 'arg'),
    sideEffects: []
  };
}

function detectStateMutation(path: any, js: string): { varName: string; type: string } | null {
  const node = path.node;
  if (!node.left) return null;

  let varName = '';
  let mutationType = 'assignment';

  if (node.left.type === 'Identifier') {
    varName = node.left.name;
  } else if (node.left.type === 'MemberExpression') {
    varName = node.left.object?.name || '';
  }

  // Check for compound assignments
  if (node.operator.includes('=') && !node.operator.startsWith('==')) {
    if (node.operator === '++' || node.operator === '--') {
      mutationType = node.operator;
    } else if (node.operator.includes('+') || node.operator.includes('-') || node.operator.includes('*')) {
      mutationType = 'arithmetic';
    }
  }

  return varName ? { varName, type: mutationType } : null;
}

function tryExtractEvent(path: any, js: string): EventBinding | null {
  const node = path.node;
  if (node.callee?.property?.name !== 'addEventListener') return null;

  const eventArg = node.arguments?.[0];
  const handlerArg = node.arguments?.[1];

  if (!eventArg || !handlerArg) return null;

  const event = eventArg.value || eventArg.name || '';
  const handler = handlerArg.name || (handlerArg.type === 'ArrowFunctionExpression' ? 'arrow' : '');

  if (!event) return null;

  return {
    selector: '',
    event,
    handler: handler || 'unnamed',
    preventDefault: false
  };
}

function tryExtractDomRef(path: any, js: string): DomRef | null {
  const node = path.node;
  const callee = node.callee;

  const domMethods = [
    'getElementById', 'getElementsByClassName', 'getElementsByTagName',
    'querySelector', 'querySelectorAll',
    'closest', 'parentElement', 'children', 'nextElementSibling', 'previousElementSibling'
  ];

  const methodName = callee?.property?.name || '';
  if (!domMethods.includes(methodName)) return null;

  const arg = node.arguments?.[0];
  const selector = arg?.value || arg?.name || '';

  if (!selector) return null;

  return { selector, method: methodName };
}

function isLikelyState(name: string): boolean {
  const patterns = ['state', 'data', 'model', 'form', 'count', 'value', 'visible', 'show', 'active', 'open', 'current', 'items', 'list', 'selected'];
  return patterns.some(p => name.toLowerCase().includes(p));
}

function isLikelyHandler(name: string): boolean {
  const patterns = ['handle', 'on', 'click', 'submit', 'change', 'toggle', 'update', 'delete', 'add', 'remove', 'fetch', 'load', 'close', 'open'];
  return patterns.some(p => name.toLowerCase().includes(p));
}

function isLifecycleMethod(name: string): boolean {
  const patterns = ['init', 'mount', 'unmount', 'destroy', 'create', 'setup', 'ready', 'render', 'update'];
  return patterns.some(p => name.toLowerCase().includes(p));
}

function scoreAsState(name: string): number {
  let score = 0.3;
  const patterns = [/state/i, /data/i, /model/i, /form/i, /value/i, /count/i, /items/i, /list/i];
  const matches = patterns.filter(p => p.test(name)).length;
  score += Math.min(0.5, matches * 0.2);
  return Math.min(1, score);
}

function inferType(init: any): string {
  if (!init) return 'unknown';
  if (init.type === 'NumericLiteral') return 'number';
  if (init.type === 'StringLiteral') return 'string';
  if (init.type === 'BooleanLiteral') return 'boolean';
  if (init.type === 'ArrayExpression') return 'array';
  if (init.type === 'ObjectExpression') return 'object';
  if (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression') return 'function';
  return 'unknown';
}

function inferInitialValue(init: any): any {
  if (!init) return undefined;
  if (init.type === 'NumericLiteral') return init.value;
  if (init.type === 'StringLiteral') return init.value;
  if (init.type === 'BooleanLiteral') return init.value;
  if (init.type === 'ArrayExpression') return [];
  if (init.type === 'ObjectExpression') return {};
  return undefined;
}

