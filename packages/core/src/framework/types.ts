/**
 * Frame type, detection results, hydration strategy interface definition
 */

/**
 * The types of frames that are supported.
 * Append to this enumeration each time a new policy is added.
 */
export type FrameworkType =
  | 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue3'
  | 'nextjs' | 'react18'
  | 'angular'
  | 'sveltekit'
  | 'astro'
  | 'static' | 'unknown';

/**
 * Framing test results
 */
export interface FrameworkDetection {
  /** Types of frames identified */
  framework: FrameworkType;
  /** Detection confidence level (0-1) for logging and debugging */
  confidence: number;
  /** Apply mount point selectors such as '#app', '#__nuxt', '#__next' */
  appElement: string | null;
  /** List of detected flags for debugging and logging purposes */
  markers: string[];
}

/**
 * Hydration Policy Interface.
 * Each framework implements a policy that matches in a deterministic order.
 */
export interface HydrationStrategy {
  /** Frame type identification */
  framework: FrameworkType;

  /** Detect if this policy matches */
  matches(detection: FrameworkDetection): boolean;

  /** Generate hydration script (HTML string, injected before </body>) */
  generateScript(detection: FrameworkDetection): string;

  /**
   * Rewrite framework-internal paths (e.g. Nuxt's window.__NUXT__.assetsPath)
   * that are not reachable through DOM element attribute modifications.
   * Called after HTML parsing, before assembleBundle.
   */
  rewritePaths(document: Document): void;
}