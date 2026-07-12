/**
 * @deprecated This module has been reorganized.
 *
 * PlaywrightFetcherAdapter and PlaywrightAdapterOptions have been moved to:
 * - Adapter: src/adapters/automation/playwright/adapter.ts
 * - Options: src/adapters/automation/playwright/options.ts
 *
 * This file remains for backward compatibility only and will be removed in v2.0.
 *
 * Migration guide:
 * ```typescript
 * // Old way (deprecated)
 * import { PlaywrightFetcherAdapter } from 'web-clone/adapters';
 *
 * // New way (recommended)
 * import { PlaywrightFetcherAdapter } from 'web-clone/adapters/automation/playwright';
 * ```
 *
 * Or use the convenience API instead:
 * ```typescript
 * import { snapshotWithPlaywright, snapshotWithBrowserContext } from 'web-clone';
 * ```
 */

// Re-export from new location for backward compatibility
export { PlaywrightFetcherAdapter } from './automation/playwright/adapter.js';
export type { PlaywrightAdapterOptions } from './automation/playwright/options.js';
