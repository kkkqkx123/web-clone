/**
 * @web-clone/core — Query module barrel export
 */

export { compileWhere, QueryError } from './expr.js';
export type { QueryEmitOptions } from './query-engine.js';
export { runQuery, typeOf, toTsv, emitQueryResult } from './query-engine.js';
export type { OutlineEntry, LocateHit, TableResult } from './html-query.js';
export {
  collapse,
  parseRowSpec,
  signature,
  selectorPath,
  inlineToMd,
  toMarkdown,
  inspectStructure,
  locateElement,
  countElements,
  tableToRows,
  rowStats,
  spaNote,
} from './html-query.js';
