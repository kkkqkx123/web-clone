/**
 * Framework-aware hydration injection module portal
 * 
 * Export:
 * - detectFramework - Unified Framework Detector
 * - injectHydrationScript - hydration script injector
 * - All type definitions
 * - All strategies (for testing or extension use)
 */

export { detectFramework } from './detector.js';
export { injectHydrationScript } from './injector.js';
export type { HydrationInjectOptions } from './injector.js';
export type { FrameworkType, FrameworkDetection, HydrationStrategy } from './types.js';
export { hydrationStrategies } from './strategies/index.js';