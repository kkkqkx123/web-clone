/**
 * Framework-aware post-snapshot probe module entry point.
 * 
 * Exports:
 * - detectFramework — unified framework detector
 * - injectHydrationScript — probe script injector
 * - PostSnapshotStrategy type
 * - All strategies (for testing or extension)
 */

export { detectFramework } from './detector.js';
export { injectHydrationScript } from './injector.js';
export type { HydrationInjectOptions } from './injector.js';
export type { FrameworkType, FrameworkDetection, PostSnapshotStrategy } from './types.js';
export { postSnapshotStrategies } from './strategies/index.js';