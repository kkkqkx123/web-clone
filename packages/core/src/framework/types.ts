/**
 * Frame type, detection results, hydration strategy interface definition
 */

/**
 * The types of frames that are supported.
 * Append to this enumeration each time a new policy is added.
 */
export type FrameworkType =
  | 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue2' | 'vue3'
  | 'nextjs' | 'react18'
  | 'angular'
  | 'sveltekit'
  | 'astro'
  | 'static' | 'unknown';

/**
 * Signal quality tier for framework detection.
 *
 * Ordered tiers from most to least reliable:
 *   definitive > strong > moderate > weak > none
 *
 * - definitive: framework-specific global variable (__NUXT__, __NEXT_DATA__, __sveltekit__)
 * - strong:      meta generator tags, framework-specific JS patterns (createSSRApp, hydrateRoot, ɵɵdefineComponent)
 * - moderate:    HTML-specific id tags (#__nuxt, #__next), inline __NUXT__ script patterns
 * - weak:        generic mount points (#svelte, ng-version/ng-app without other signals)
 * - none:        no framework detected
 */
export type SignalTier = 'definitive' | 'strong' | 'moderate' | 'weak' | 'none';

/** Ordinal rank for SignalTier comparison. */
const TIER_RANK: Record<SignalTier, number> = {
  definitive: 4,
  strong: 3,
  moderate: 2,
  weak: 1,
  none: 0,
};

/**
 * Compare two signal tiers. Returns positive if a > b, negative if b > a, zero if equal.
 */
export function compareTier(a: SignalTier, b: SignalTier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/**
 * Framing test results
 */
export interface FrameworkDetection {
  /** Types of frames identified */
  framework: FrameworkType;
  /** Signal quality tier reflecting the detection method used */
  tier: SignalTier;
  /** Apply mount point selectors such as '#app', '#__nuxt', '#__next' */
  appElement: string | null;
  /** List of detected flags for debugging and logging purposes */
  markers: string[];
}

/**
 * 水合策略接口 → 重命名为 PostSnapshotStrategy。
 *
 * 原因：大部分框架的 generateScript 只在快照后用 setInterval 轮询
 * 框架内部标记（__vue__/__reactRoot$ 等），仅输出诊断日志，并不触发实际的
 * 挂载/水合过程。唯一例外为 Nuxt 2（主动调用 $nuxt.$mount()）。
 *
 * 重命名以消除"水合"一词的误导性，明确表达这是快照后诊断探测。
 */
export interface PostSnapshotStrategy {
  /** 框架类型标识 */
  framework: FrameworkType;

  /** 检测此策略是否匹配 */
  matches(detection: FrameworkDetection): boolean;

  /**
   * 生成快照后探测脚本（HTML 字符串，注入在 </body> 之前）。
   * 该脚本是诊断观察者，不重注水合（Nuxt 2 除外）。
   */
  generateProbeScript(detection: FrameworkDetection): string;

  /**
   * 重写框架内部路径（如 Nuxt 的 window.__NUXT__.assetsPath），
   * 这些路径无法通过 DOM 元素属性修改触及。
   * 在 HTML 解析后、assembleBundle 前调用。
   */
  rewritePaths(document: Document): void;

  /**
   * 如果为 true，探针脚本始终注入，不受 debugProbe 控制。
   * 仅用于功能性探针（如 Nuxt 2 的 $nuxt.$mount() 重挂载）。
   */
  alwaysInject?: boolean;
}
