/**
 * Frame type, detection results, hydration strategy interface definition
 */

/**
 * The types of frames that are supported.
 * Append to this enumeration each time a new policy is added.
 */
export type FrameworkType =
  | 'nuxt2' | 'nuxt3' | 'vitepress' | 'vue3'
  | 'nextjs' | 'react' | 'react18'
  | 'angular' | 'angular-ssr'
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
  /** Availability of SSR data (e.g., global variables such as __NUXT__, __NEXT_DATA__, etc.) */
  ssrData: boolean;
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

  /** Whether additional resource path rewriting is required */
  needsPathRewrite: boolean;

  /** Path rewrite rules (optional) */
  pathRewriteRules?: Array<{ from: RegExp; to: string }>;
}