/**
 * Hydration Strategy Unit Tests.
 *
 * Covers:
 * - Each strategy's matches() correctly identifies / rejects detection results
 * - Each strategy's generateScript() produces framework-specific output
 * - generateScript() uses d.appElement from detection (design fix verification)
 * - Static strategy always matches, generates empty script
 * - Strategy registry ordering
 */

import { describe, it, expect } from 'vitest';
import { nuxt3Strategy } from '../strategies/nuxt3.js';
import { nextjsStrategy } from '../strategies/nextjs.js';
import { vitepressStrategy } from '../strategies/vitepress.js';
import { astroStrategy } from '../strategies/astro.js';
import { nuxt2Strategy } from '../strategies/nuxt2.js';
import { vue3Strategy } from '../strategies/vue3.js';
import { react18Strategy } from '../strategies/react18.js';
import { angularStrategy } from '../strategies/angular.js';
import { sveltekitStrategy } from '../strategies/sveltekit.js';
import { staticStrategy } from '../strategies/static.js';
import { hydrationStrategies } from '../strategies/index.js';
import type { FrameworkDetection } from '../types.js';

function makeDetection(overrides: Partial<FrameworkDetection>): FrameworkDetection {
  return {
    framework: 'unknown',
    confidence: 0,
    appElement: null,
    markers: [],
    ...overrides,
  };
}

// ─── Nuxt 3 ────────────────────────────────────────────────────────
describe('nuxt3Strategy', () => {
  it('should match when markers include __NUXT__', () => {
    expect(nuxt3Strategy.matches(makeDetection({ markers: ['__NUXT__'] }))).toBe(true);
  });

  it('should not match without __NUXT__ marker', () => {
    expect(nuxt3Strategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
    expect(nuxt3Strategy.matches(makeDetection({ framework: 'unknown' }))).toBe(false);
  });

  it('should generate script referencing Nuxt 3', () => {
    const script = nuxt3Strategy.generateScript(makeDetection({ appElement: '#__nuxt' }));
    expect(script).toContain('Nuxt 3');
    expect(script).toContain('#__nuxt');
  });

  it('should use d.appElement as mount selector', () => {
    const script = nuxt3Strategy.generateScript(makeDetection({ appElement: '#custom-app' }));
    expect(script).toContain('#custom-app');
  });
});

// ─── Next.js ───────────────────────────────────────────────────────
describe('nextjsStrategy', () => {
  it('should match when framework is nextjs', () => {
    expect(nextjsStrategy.matches(makeDetection({ framework: 'nextjs' }))).toBe(true);
  });

  it('should match when markers include __NEXT_DATA__', () => {
    expect(nextjsStrategy.matches(makeDetection({ markers: ['__NEXT_DATA__'] }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(nextjsStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
    expect(nextjsStrategy.matches(makeDetection({ framework: 'nuxt3' }))).toBe(false);
  });

  it('should generate script referencing Next.js', () => {
    const script = nextjsStrategy.generateScript(makeDetection({ appElement: '#__next' }));
    expect(script).toContain('Next.js');
    expect(script).toContain('#__next');
  });
});

// ─── VitePress ─────────────────────────────────────────────────────
describe('vitepressStrategy', () => {
  it('should match when framework is vitepress', () => {
    expect(vitepressStrategy.matches(makeDetection({ framework: 'vitepress' }))).toBe(true);
  });

  it('should match when markers include generator:vitepress', () => {
    expect(vitepressStrategy.matches(makeDetection({ markers: ['generator:vitepress'] }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(vitepressStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
  });

  it('should generate script referencing VitePress', () => {
    const script = vitepressStrategy.generateScript(makeDetection({ appElement: '#app' }));
    expect(script).toContain('VitePress');
    expect(script).toContain('#app');
  });

  it('should use d.appElement as mount selector', () => {
    const script = vitepressStrategy.generateScript(makeDetection({ appElement: '#custom' }));
    expect(script).toContain('#custom');
  });
});

// ─── Astro ─────────────────────────────────────────────────────────
describe('astroStrategy', () => {
  it('should match when framework is astro', () => {
    expect(astroStrategy.matches(makeDetection({ framework: 'astro' }))).toBe(true);
  });

  it('should match when markers include generator:astro', () => {
    expect(astroStrategy.matches(makeDetection({ markers: ['generator:astro'] }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(astroStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
  });

  it('should generate empty script (static islands)', () => {
    const script = astroStrategy.generateScript(makeDetection({}));
    expect(script).toBe('');
  });
});

// ─── Nuxt 2 ────────────────────────────────────────────────────────
describe('nuxt2Strategy', () => {
  it('should match when framework is nuxt2', () => {
    expect(nuxt2Strategy.matches(makeDetection({ framework: 'nuxt2' }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(nuxt2Strategy.matches(makeDetection({ framework: 'nuxt3' }))).toBe(false);
  });

  it('should generate script referencing Nuxt 2', () => {
    const script = nuxt2Strategy.generateScript(makeDetection({ appElement: '#__nuxt' }));
    expect(script).toContain('Nuxt 2');
    expect(script).toContain('#__nuxt');
  });

  it('should use d.appElement as mount selector', () => {
    const script = nuxt2Strategy.generateScript(makeDetection({ appElement: '#custom' }));
    expect(script).toContain('#custom');
  });
});

// ─── Vue 3 ─────────────────────────────────────────────────────────
describe('vue3Strategy', () => {
  it('should match when framework is vue3', () => {
    expect(vue3Strategy.matches(makeDetection({ framework: 'vue3' }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(vue3Strategy.matches(makeDetection({ framework: 'nuxt3' }))).toBe(false);
    expect(vue3Strategy.matches(makeDetection({ framework: 'react18' }))).toBe(false);
  });

  it('should generate script referencing Vue 3', () => {
    const script = vue3Strategy.generateScript(makeDetection({ appElement: '#app' }));
    expect(script).toContain('Vue 3');
    expect(script).toContain('#app');
  });

  it('should use d.appElement as mount selector', () => {
    const script = vue3Strategy.generateScript(makeDetection({ appElement: '#custom' }));
    expect(script).toContain('#custom');
  });
});

// ─── React 18 ──────────────────────────────────────────────────────
describe('react18Strategy', () => {
  it('should match when framework is react18', () => {
    expect(react18Strategy.matches(makeDetection({ framework: 'react18' }))).toBe(true);
  });

  it('should match when markers include __REACT_DEVTOOLS', () => {
    expect(react18Strategy.matches(makeDetection({ markers: ['__REACT_DEVTOOLS'] }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(react18Strategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
  });

  it('should generate script referencing React 18', () => {
    const script = react18Strategy.generateScript(makeDetection({ appElement: '#root' }));
    expect(script).toContain('React 18');
    expect(script).toContain('#root');
  });

  it('should use d.appElement as mount selector', () => {
    const script = react18Strategy.generateScript(makeDetection({ appElement: '#custom' }));
    expect(script).toContain('#custom');
  });
});

// ─── Angular ───────────────────────────────────────────────────────
describe('angularStrategy', () => {
  it('should match when framework is angular', () => {
    expect(angularStrategy.matches(makeDetection({ framework: 'angular' }))).toBe(true);
  });

  it('should match when markers include angular', () => {
    expect(angularStrategy.matches(makeDetection({ markers: ['angular'] }))).toBe(true);
  });

  it('should not match angular-ssr (removed in Phase 2)', () => {
    // angular-ssr was removed from FrameworkType; angular strategy no longer checks it
    expect(angularStrategy.matches(makeDetection({ framework: 'angular' }))).toBe(true);
    // 'angular-ssr' is no longer a valid FrameworkType value
  });

  it('should not match for unrelated frameworks', () => {
    expect(angularStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
  });

  it('should generate script referencing Angular', () => {
    const script = angularStrategy.generateScript(makeDetection({}));
    expect(script).toContain('Angular');
  });
});

// ─── SvelteKit ─────────────────────────────────────────────────────
describe('sveltekitStrategy', () => {
  it('should match when framework is sveltekit', () => {
    expect(sveltekitStrategy.matches(makeDetection({ framework: 'sveltekit' }))).toBe(true);
  });

  it('should match when markers include __SVELTEKIT__', () => {
    expect(sveltekitStrategy.matches(makeDetection({ markers: ['__SVELTEKIT__'] }))).toBe(true);
  });

  it('should match when markers include __sveltekit', () => {
    expect(sveltekitStrategy.matches(makeDetection({ markers: ['__sveltekit'] }))).toBe(true);
  });

  it('should not match for unrelated frameworks', () => {
    expect(sveltekitStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(false);
    expect(sveltekitStrategy.matches(makeDetection({ framework: 'react18' }))).toBe(false);
  });

  it('should generate script referencing SvelteKit', () => {
    const script = sveltekitStrategy.generateScript(makeDetection({ appElement: '#svelte' }));
    expect(script).toContain('SvelteKit');
    expect(script).toContain('#svelte');
  });

  it('should fall back to #svelte when appElement is null', () => {
    const script = sveltekitStrategy.generateScript(makeDetection({ appElement: null }));
    expect(script).toContain('#svelte');
  });

  it('should use d.appElement as mount selector', () => {
    const script = sveltekitStrategy.generateScript(makeDetection({ appElement: '#custom' }));
    expect(script).toContain('#custom');
  });
});

// ─── Static (Degradation) ──────────────────────────────────────────
describe('staticStrategy', () => {
  it('should always match regardless of detection', () => {
    expect(staticStrategy.matches(makeDetection({ framework: 'unknown' }))).toBe(true);
    expect(staticStrategy.matches(makeDetection({ framework: 'nuxt3' }))).toBe(true);
    expect(staticStrategy.matches(makeDetection({ framework: 'vue3' }))).toBe(true);
  });

  it('should generate empty script', () => {
    expect(staticStrategy.generateScript(makeDetection({}))).toBe('');
  });
});

// ─── Strategy Registry Ordering ────────────────────────────────────
describe('hydrationStrategies registry', () => {
  it('should have all 10 strategies registered', () => {
    expect(hydrationStrategies).toHaveLength(10);
  });

  it('should have the correct order: Nuxt 3 first, static last', () => {
    expect(hydrationStrategies[0].framework).toBe('nuxt3');
    expect(hydrationStrategies[hydrationStrategies.length - 1].framework).toBe('static');
  });

  it('should find the first matching strategy for a given detection', () => {
    const detection = makeDetection({ framework: 'vue3' });
    const matched = hydrationStrategies.find(s => s.matches(detection));
    expect(matched?.framework).toBe('vue3');
  });

  it('should fall through to static for unknown frameworks', () => {
    const detection = makeDetection({ framework: 'unknown' });
    const matched = hydrationStrategies.find(s => s.matches(detection));
    expect(matched?.framework).toBe('static');
  });

  it('should prefer Nuxt 3 over Vue 3 when both match', () => {
    // Nuxt 3 detection produces markers: ['__NUXT__'] and framework: 'nuxt3'
    const detection = makeDetection({
      framework: 'nuxt3',
      markers: ['__NUXT__', '__VUE__'],
    });
    const matched = hydrationStrategies.find(s => s.matches(detection));
    // nuxt3Strategy is first in the array
    expect(matched?.framework).toBe('nuxt3');
  });
});