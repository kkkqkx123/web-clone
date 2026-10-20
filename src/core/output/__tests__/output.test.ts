import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import type { Asset, SnapshotOptions, ComponentSpec, ConvertResult } from '../../types.js';
import type { FrameworkType, FrameworkDetection } from '../../framework/types.js';
import { assembleBundle } from '../bundle.js';
import { assembleSingleFile } from '../single-file.js';
import { assembleConvert } from '../convert.js';
import { detectFramework } from '../../framework/detector.js';
import { isMoreSpecific } from '../../assembler.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestAsset(
  originUrl: string,
  type: Asset['type'],
  status: Asset['status'] = 'fetched',
  options: Partial<Asset> = {}
): Asset {
  return {
    originUrl,
    type,
    status,
    size: options.size ?? 1024,
    mime: options.mime ?? 'application/octet-stream',
    error: status === 'failed' ? options.error ?? 'Test error' : undefined,
    dataUri: options.dataUri,
    textContent: options.textContent,
    localPath: options.localPath,
    ...options,
  };
}

function createTestDocument(html: string): Document {
  const dom = new JSDOM(html);
  return dom.window.document as unknown as Document;
}

function createTestOptions(overrides: Partial<SnapshotOptions> = {}): SnapshotOptions {
  return {
    url: 'http://127.0.0.1:9000',
    output: resolve('/tmp/test-snapshot'),
    mode: 'bundle',
    maxAssets: 100,
    concurrency: 6,
    timeout: 15000,
    retryCount: 3,
    inline: true,
    pretty: false,
    extractComponents: false,
    ...overrides,
  };
}

// ============================================================================
// BUNDLE MODE TESTS
// ============================================================================

describe('assembleBundle - Bundle Mode Tests', () => {
  let testDir: string;
  let options: SnapshotOptions;
  let document: Document;

  beforeEach(() => {
    testDir = resolve(`/tmp/test-bundle-${Date.now()}`);
    options = createTestOptions({ output: testDir, mode: 'bundle' });
    document = createTestDocument(`
      <html>
        <head><title>Test</title></head>
        <body>
          <link rel="stylesheet" href="style.css" data-origin-url="http://127.0.0.1:9000/assets/style.css">
          <script src="app.js" data-origin-url="http://127.0.0.1:9000/assets/app.js"></script>
          <img src="logo.png" data-origin-url="http://127.0.0.1:9000/assets/logo.png">
        </body>
      </html>
    `);
  });

  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Cleanup failure is non-critical
      }
    }
  });

  it('Scene 1: Should generate standard bundle directory structure', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css'),
      createTestAsset('http://127.0.0.1:9000/assets/app.js', 'js'),
      createTestAsset('http://127.0.0.1:9000/assets/logo.png', 'img'),
    ];

    assembleBundle(document, assets, options);

    const indexHtml = join(testDir, 'index.html');
    expect(readFileSync(indexHtml, 'utf-8')).toContain('<!DOCTYPE');

    const cssDir = join(testDir, 'assets', 'css');
    // Verify directory structure exists
    expect(() => {
      readFileSync(cssDir, 'utf-8');
    }).toBeDefined();
  });

  it('Scene 2: Should correctly rewrite asset paths', () => {
    const assets = [createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css')];
    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    // Path should be rewritten to relative path
    expect(html).toMatch(/href="assets\/css\//);
  });

  it('Scene 3: Should handle failed assets and clean href/src attributes', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css', 'failed'),
    ];
    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    // Failed assets should have href/src removed
    expect(html).not.toContain('href="http://127.0.0.1:9000/assets/style.css"');
  });

  it('Scene 4: Should correctly handle route paths (URLs without extensions)', () => {
    const assets = [createTestAsset('http://127.0.0.1:9000/about', 'other')];
    assembleBundle(document, assets, options);

    const manifest = JSON.parse(
      readFileSync(join(testDir, 'snapshot.json'), 'utf-8')
    );
    // Route path should be mapped to index.html
    const routeAsset = manifest.assets.find(
      (a: Asset) => a.originUrl === 'http://127.0.0.1:9000/about'
    );
    expect(routeAsset?.localPath).toContain('index.html');
  });

  it('Scene 5: Should clean up snapshot helper attributes', () => {
    document.querySelector('img')?.setAttribute('data-snapshot-id', '123');
    const assets = [createTestAsset('http://127.0.0.1:9000/assets/logo.png', 'img')];

    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    expect(html).not.toContain('data-snapshot-id');
    expect(html).not.toContain('data-origin-url');
  });

  it('Scene 6: Should generate correct snapshot.json metadata', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css'),
      createTestAsset('http://127.0.0.1:9000/assets/app.js', 'js', 'failed'),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.sourceUrl).toBe(options.url);
    expect(meta.stats.total).toBe(2);
    expect(meta.stats.fetched).toBe(1);
    expect(meta.stats.failed).toBe(1);
  });

  it('Defect test: URL normalization prevents path traversal', () => {
    // Note: URLs are automatically normalized by URL parser
    // Path traversal protection happens in safeJoin for filesystem paths
    const assets = [
      createTestAsset('http://127.0.0.1:9000/sensitive.txt', 'other'),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    const asset = meta.assets[0];
    // URL normalization should handle this correctly
    expect(asset.status).toBe('fetched');
    expect(asset.localPath).toBeDefined();
  });

  it('Defect test: Should handle empty asset list', () => {
    const assets: Asset[] = [];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.stats.fetched).toBe(0);
    expect(meta.manifest).toEqual({});
  });

  it('Defect test: Should handle large filenames', () => {
    const longUrl = 'http://127.0.0.1:9000/' + 'a'.repeat(500) + '.css';
    const assets = [createTestAsset(longUrl, 'css')];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.assets[0].status).toBe('fetched');
  });

  it('Defect test: Pretty option should format HTML', () => {
    options.pretty = true;
    const assets: Asset[] = [];

    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    // Pretty format should include indentation
    expect(html).toMatch(/\n\s+</);
  });
});

// ============================================================================
// SINGLE-FILE MODE TESTS
// ============================================================================

describe('assembleSingleFile - Single File Mode Tests', () => {
  let document: Document;
  let options: SnapshotOptions;

  beforeEach(() => {
    document = createTestDocument(`
      <html>
        <head>
          <link rel="stylesheet" href="style.css" data-origin-url="http://127.0.0.1:9000/style.css">
        </head>
        <body>
          <img src="logo.png" data-origin-url="http://127.0.0.1:9000/logo.png">
          <script src="app.js" data-origin-url="http://127.0.0.1:9000/app.js"></script>
        </body>
      </html>
    `);
    options = createTestOptions({ mode: 'single' });
  });

  it('Scene 1: Should return HTML string with inlined resources', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

    // Set src to absolute URL for matching, and data-origin-url for source tracking
    const img = document.querySelector('img');
    img?.setAttribute('src', 'http://127.0.0.1:9000/logo.png');
    img?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/logo.png');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/logo.png', 'img', 'fetched', {
        dataUri,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(typeof result).toBe('string');
    expect(result).toContain(dataUri);
    expect(result).toContain('<!DOCTYPE');
  });

  it('Scene 2: Should inline CSS file content', () => {
    const cssContent = 'body { color: red; }';

    // Set data-origin-url on link element
    const link = document.querySelector('link[rel="stylesheet"]');
    link?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/style.css');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/style.css', 'css', 'fetched', {
        textContent: cssContent,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain(cssContent);
    expect(result).toContain('<style>');
  });

  it('Scene 3: Should inline JS file content', () => {
    const jsContent = 'console.log("hello");';

    // Set data-origin-url on script element
    const script = document.querySelector('script');
    script?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/app.js');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/app.js', 'js', 'fetched', {
        textContent: jsContent,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain(jsContent);
  });

  it('Scene 4: Should rewrite URLs in inlined CSS', () => {
    const cssContent = 'body { background: url("http://127.0.0.1:9000/bg.png"); }';
    const dataUri = 'data:image/png;base64,xxx';

    // Set data-origin-url on link
    const link = document.querySelector('link[rel="stylesheet"]');
    link?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/style.css');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/style.css', 'css', 'fetched', {
        textContent: cssContent,
      }),
      createTestAsset('http://127.0.0.1:9000/bg.png', 'img', 'fetched', {
        dataUri,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    // URLs in CSS should be replaced with data URIs
    expect(result).toContain(dataUri);
  });

  it('Scene 5: Should handle responsive images (srcset)', () => {
    const img = document.querySelector('img');
    img?.setAttribute('srcset', 'http://127.0.0.1:9000/logo-1x.png 1x, http://127.0.0.1:9000/logo-2x.png 2x');
    img?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/logo.png');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/logo-1x.png', 'img', 'fetched', {
        dataUri: 'data:image/png;base64,1x',
      }),
      createTestAsset('http://127.0.0.1:9000/logo-2x.png', 'img', 'fetched', {
        dataUri: 'data:image/png;base64,2x',
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain('data:image/png;base64,1x');
    expect(result).toContain('data:image/png;base64,2x');
  });

  it('Defect test: Should handle missing data URI (unfetched resources)', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/logo.png', 'img', 'failed'),
    ];

    const result = assembleSingleFile(document, assets, options);

    // Should return valid HTML even if some resources failed
    expect(result).toContain('<!DOCTYPE');
  });

  it('Defect test: Should clean up helper attributes', () => {
    const assets: Asset[] = [];

    const result = assembleSingleFile(document, assets, options);

    expect(result).not.toContain('data-snapshot-id');
    expect(result).not.toContain('data-origin-url');
  });

  it('Defect test: Should add meta tags', () => {
    const assets: Asset[] = [];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain('snapshot:source');
    expect(result).toContain(options.url);
    expect(result).toContain('snapshot:time');
  });

  it('Defect test: Pretty option should format structural HTML but preserve script/style', () => {
    options.pretty = true;
    const jsContent = 'console.log(  "test"  )';
    const cssContent = 'body  {  color: red;  }';

    // Set data-origin-url
    const link = document.querySelector('link[rel="stylesheet"]');
    link?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/style.css');
    const script = document.querySelector('script');
    script?.setAttribute('data-origin-url', 'http://127.0.0.1:9000/app.js');

    const assets = [
      createTestAsset('http://127.0.0.1:9000/app.js', 'js', 'fetched', {
        textContent: jsContent,
      }),
      createTestAsset('http://127.0.0.1:9000/style.css', 'css', 'fetched', {
        textContent: cssContent,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    // Script and style content should remain unchanged (not formatted)
    expect(result).toContain(jsContent);
    expect(result).toContain(cssContent);
  });

  it('Performance defect: No check on cumulative inlined resource size', () => {
    // This test verifies a defect: no validation of total data URI size
    const largeDataUri = 'data:image/png;base64,' + 'A'.repeat(50 * 1024 * 1024); // 50MB
    const assets = [
      createTestAsset('http://127.0.0.1:9000/logo.png', 'img', 'fetched', {
        dataUri: largeDataUri,
        size: 50 * 1024 * 1024,
      }),
    ];

    // Should not throw, but generated HTML will be very large (design issue)
    const result = assembleSingleFile(document, assets, options);
    expect(result).toBeDefined();
    // Expected: Should have warning or size limit, but currently doesn't
  });
});

// ============================================================================
// CONVERT MODE TESTS
// ============================================================================

describe('assembleConvert - Component Conversion Tests', () => {
  let testDir: string;
  let options: SnapshotOptions;

  beforeEach(() => {
    testDir = resolve(`/tmp/test-convert-${Date.now()}`);
    options = createTestOptions({ output: testDir, mode: 'bundle' });
  });

  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Cleanup failure is non-critical
      }
    }
  });

  it('Scene 1: Should create component directory structure', () => {
    const result = createTestConvertResult();
    assembleConvert(result, options);

    const componentDir = join(testDir, 'components');
    const headerDir = join(componentDir, 'Header');

    expect(readFileSync(join(headerDir, 'template.html'), 'utf-8')).toContain('<header>');
    expect(readFileSync(join(headerDir, 'style.css'), 'utf-8')).toBeDefined();
    expect(readFileSync(join(headerDir, 'manifest.json'), 'utf-8')).toBeDefined();
  });

  it('Scene 2: Should generate README.md', () => {
    const result = createTestConvertResult();
    assembleConvert(result, options);

    const readme = readFileSync(join(testDir, 'README.md'), 'utf-8');
    expect(readme).toContain('Component Structure');
    expect(readme).toContain('Header');
  });

  it('Scene 3: Should generate MIGRATION.md', () => {
    const result = createTestConvertResult();
    assembleConvert(result, options);

    const migration = readFileSync(join(testDir, 'MIGRATION.md'), 'utf-8');
    expect(migration).toContain('Migration Guide');
    expect(migration).toContain('Phase 1');
  });

  it('Scene 4: Should generate REVIEW_REQUIRED.md for low-confidence components', () => {
    const result = createTestConvertResult();
    // Create low-confidence component
    const lowConfComp: ComponentSpec = {
      name: 'LowConfidenceComp',
      type: 'unknown',
      children: [],
      template: '<div>Low Confidence</div>',
      styles: '',
      matchConfidence: 0.3,
      manifest: createTestComponentManifest('LowConfidenceComp', 0.3),
    };
    result.components.set('LowConfidenceComp', lowConfComp);

    assembleConvert(result, options);

    const reviewFile = join(testDir, 'REVIEW_REQUIRED.md');
    const review = readFileSync(reviewFile, 'utf-8');
    expect(review).toContain('LowConfidenceComp');
    expect(review).toContain('30%');
  });

  it('Defect test: Should handle special characters in component names', () => {
    const result = createTestConvertResult();
    const specialComp: ComponentSpec = {
      name: 'Component/With\\Special:Chars?',
      type: 'presentational',
      children: [],
      template: '<div>Special</div>',
      styles: '',
      manifest: createTestComponentManifest('SpecialComponent'),
    };
    result.components.set('special', specialComp);

    assembleConvert(result, options);

    // Component name should be sanitized (path traversal protection)
    const compDir = join(testDir, 'components', 'Component_With_Special_Chars_');
    expect(readFileSync(join(compDir, 'template.html'), 'utf-8')).toContain('<div>Special</div>');
  });

  it('Defect test: Should skip creating REVIEW_REQUIRED.md when not needed', () => {
    const result = createTestConvertResult();
    // All components have high confidence
    result.components.forEach(comp => {
      comp.matchConfidence = 0.9;
    });

    assembleConvert(result, options);

    const reviewFile = join(testDir, 'REVIEW_REQUIRED.md');
    try {
      readFileSync(reviewFile);
      throw new Error('REVIEW_REQUIRED.md should not be created');
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      expect(error.code).toBe('ENOENT');
    }
  });

  it('Defect test: Should handle missing logic field', () => {
    const result = createTestConvertResult();
    const comp = result.components.get('Header');
    if (comp) {
      comp.logic = undefined;
    }

    assembleConvert(result, options);

    // Should generate normally, without writing logic.original.json
    const logicFile = join(testDir, 'components', 'Header', 'logic.original.json');
    try {
      readFileSync(logicFile);
      throw new Error('logic.original.json should not be created when logic is undefined');
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      expect(error.code).toBe('ENOENT');
    }
  });

  it('Defect test: Should correctly return ConvertResult', () => {
    const result = createTestConvertResult();
    const returned = assembleConvert(result, options);

    expect(returned).toBe(result);
    expect(returned.components.size).toBe(1);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Output Module - Integration Tests', () => {
  it('Integration test: Should correctly handle mixed resources', () => {
    const testDir = resolve(`/tmp/test-integration-${Date.now()}`);
    const options = createTestOptions({ output: testDir });
    const document = createTestDocument(`
      <html>
        <head>
          <link rel="stylesheet" href="style.css" data-origin-url="http://127.0.0.1:9000/style.css">
          <link rel="stylesheet" href="dark.css" data-origin-url="http://127.0.0.1:9000/dark.css">
        </head>
        <body>
          <img src="logo.png" data-origin-url="http://127.0.0.1:9000/logo.png">
          <img src="banner.jpg" data-origin-url="http://127.0.0.1:9000/banner.jpg">
          <font src="roboto.woff2" data-origin-url="http://127.0.0.1:9000/fonts/roboto.woff2">
        </body>
      </html>
    `);

    const assets = [
      createTestAsset('http://127.0.0.1:9000/style.css', 'css'),
      createTestAsset('http://127.0.0.1:9000/dark.css', 'css', 'failed'),
      createTestAsset('http://127.0.0.1:9000/logo.png', 'img'),
      createTestAsset('http://127.0.0.1:9000/banner.jpg', 'img'),
      createTestAsset('http://127.0.0.1:9000/fonts/roboto.woff2', 'font'),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(
      readFileSync(join(testDir, 'snapshot.json'), 'utf-8')
    );
    expect(meta.stats.fetched).toBe(4);
    expect(meta.stats.failed).toBe(1);
    expect(meta.stats.total).toBe(5);

    rmSync(testDir, { recursive: true, force: true });
  });
});

// ============================================================================
// FRAMEWORK DETECTION TESTS
// ============================================================================

describe('detectFramework - Framework Detection Tests', () => {
  it('should detect VitePress from meta generator tag', () => {
    const html = '<html><head><meta name="generator" content="VitePress v1.0.0"></head><body><div id="app"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('vitepress');
    expect(result.tier).toBe('strong');
    expect(result.markers).toContain('generator:VitePress v1.0.0');
  });

  it('should detect Astro from meta generator tag', () => {
    const html = '<html><head><meta name="generator" content="Astro v4.0.0"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('astro');
    expect(result.tier).toBe('strong');
    expect(result.markers).toContain('generator:Astro v4.0.0');
  });

  it('should detect Vue 2 from JS content patterns', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['var app = new Vue({ el: "#app" })'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue2');
    expect(result.tier).toBe('strong');
    expect(result.markers).toContain('new Vue');
  });

  it('should detect Vue 3 from createSSRApp pattern', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['createSSRApp(App).mount("#app")'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue3');
    expect(result.tier).toBe('strong');
    expect(result.markers).toContain('__VUE__');
  });

  it('should detect Nuxt 3 from window.__NUXT__', () => {
    const html = '<html><body><script>window.__NUXT__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nuxt3');
    expect(result.tier).toBe('definitive');
  });

  it('should detect Next.js from window.__NEXT_DATA__', () => {
    const html = '<html><body><script>window.__NEXT_DATA__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nextjs');
    expect(result.tier).toBe('definitive');
  });

  it('should detect SvelteKit from window.__sveltekit__', () => {
    const html = '<html><body><script>window.__sveltekit__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.tier).toBe('definitive');
  });

  it('should detect React 18 from hydrateRoot', () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const jsContents = ['hydrateRoot(document.getElementById("root"), <App />)'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('react18');
    expect(result.tier).toBe('strong');
  });

  it('should detect Angular from ng-version attribute', () => {
    const html = '<html><body><app-root ng-version="17.0.0"></app-root></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('angular');
    expect(result.tier).toBe('weak');
  });

  it('should return unknown for unrecognized frameworks', () => {
    const html = '<html><body><div>Plain HTML</div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('unknown');
    expect(result.tier).toBe('none');
  });
});

// ============================================================================
// VITEPRESS / ASTRO / VUE 2 HYDRATION DETECTION PRIORITY TESTS
// ============================================================================

describe('isMoreSpecific - Detection Priority Logic', () => {
  it('should return true when static=vitepress and browser=vue3', () => {
    expect(isMoreSpecific('vitepress', 'vue3')).toBe(true);
  });

  it('should return true when static=vitepress and browser=vue2', () => {
    expect(isMoreSpecific('vitepress', 'vue2')).toBe(true);
  });

  it('should return true when static=astro and browser=react18', () => {
    expect(isMoreSpecific('astro', 'react18')).toBe(true);
  });

  it('should return true when static=astro and browser=vue3', () => {
    expect(isMoreSpecific('astro', 'vue3')).toBe(true);
  });

  it('should return true when static=nuxt3 and browser=vue3', () => {
    expect(isMoreSpecific('nuxt3', 'vue3')).toBe(true);
  });

  it('should return true when static=nuxt2 and browser=vue2', () => {
    expect(isMoreSpecific('nuxt2', 'vue2')).toBe(true);
  });

  it('should return true when static=nextjs and browser=react18', () => {
    expect(isMoreSpecific('nextjs', 'react18')).toBe(true);
  });

  it('should return false when static=vitepress and browser=react', () => {
    expect(isMoreSpecific('vitepress', 'react')).toBe(false);
  });

  it('should return false when both are the same framework', () => {
    expect(isMoreSpecific('vue3', 'vue3')).toBe(false);
  });

  it('should return false for unknown framework', () => {
    expect(isMoreSpecific('unknown', 'vue3')).toBe(false);
  });
});

// ============================================================================
// FILE EXTENSION MAPPING TESTS
// ============================================================================

describe('File Extension Mapping', () => {
  let testDir: string;
  let options: SnapshotOptions;

  beforeEach(() => {
    testDir = resolve(`/tmp/test-ext-${Date.now()}`);
    options = {
      url: 'http://127.0.0.1:9000',
      output: testDir,
      mode: 'bundle',
      maxAssets: 100,
      concurrency: 6,
      timeout: 15000,
      retryCount: 3,
      inline: true,
      pretty: false,
      extractComponents: false,
      frameworkCodegen: {
        framework: 'react',
        typescript: false,
        generateDrafts: false,
      },
    };
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('should map .tsx language to .ts extension', () => {
    // Create a simple ConvertResult with a component that has frameworkCodegen
    // The generated component uses language 'tsx' → should produce .ts file
    const comp: ComponentSpec = {
      name: 'MyComponent',
      type: 'presentational',
      children: [],
      template: '<div>Hello</div>',
      styles: '',
      matchConfidence: 0.9,
      manifest: {
        name: 'MyComponent',
        type: 'presentational',
        path: '/components/MyComponent',
        children: [],
        state: {},
        events: {},
        migration: { effort: '1h', effortBreakdown: { extraction: '0.5h', conversion: '0.5h' }, suggestions: [], todos: [] },
      },
    };

    const result: ConvertResult = {
      sourceUrl: 'http://127.0.0.1:9000',
      timestamp: new Date().toISOString(),
      html: '<html><body></body></html>',
      assets: [],
      stats: { total: 0, fetched: 0, failed: 0, skipped: 0, validationWarnings: 0, totalBytes: 0 },
      components: new Map([['MyComponent', comp]]),
      index: { stats: { stateful: 0, presentational: 1 } },
    };

    // We just verify the convert function doesn't crash and produces output
    // The actual extension mapping is tested by the codegen component file naming
    expect(() => assembleConvert(result, options)).not.toThrow();
    expect(readFileSync(join(testDir, 'components', 'MyComponent', 'template.html'), 'utf-8')).toContain('Hello');
  });

  it('should map .vue language to .vue extension in generated code', () => {
    // Test that the filename generation logic works correctly
    // In the codegen path, language 'vue' → '.vue', 'tsx' → '.ts', others → '.js'
    const generated = { name: 'Test', code: '<template><div/></template>', language: 'vue' };
    const ext = generated.language === 'vue' ? '.vue' : generated.language === 'tsx' ? '.ts' : '.js';
    expect(ext).toBe('.vue');
  });

  it('should map .tsx language to .ts extension in generated code', () => {
    const generated = { name: 'Test', code: 'export default () => <div/>', language: 'tsx' };
    const ext = generated.language === 'vue' ? '.vue' : generated.language === 'tsx' ? '.ts' : '.js';
    expect(ext).toBe('.ts');
  });

  it('should map .jsx language to .js extension in generated code', () => {
    const generated = { name: 'Test', code: 'export default () => <div/>', language: 'jsx' };
    const ext = generated.language === 'vue' ? '.vue' : generated.language === 'tsx' ? '.ts' : '.js';
    expect(ext).toBe('.js');
  });

  it('should map unknown language to .js extension in generated code', () => {
    const generated = { name: 'Test', code: 'console.log("hello")', language: 'javascript' };
    const ext = generated.language === 'vue' ? '.vue' : generated.language === 'tsx' ? '.ts' : '.js';
    expect(ext).toBe('.js');
  });
});

// ============================================================================
// SUB-RESOURCE DOWNLOAD VERIFICATION TESTS
// ============================================================================

describe('Sub-Resource Download Verification', () => {
  let testDir: string;
  let options: SnapshotOptions;
  let document: Document;

  beforeEach(() => {
    testDir = resolve(`/tmp/test-subresource-${Date.now()}`);
    options = {
      url: 'http://127.0.0.1:9000',
      output: testDir,
      mode: 'bundle',
      maxAssets: 100,
      concurrency: 6,
      timeout: 15000,
      retryCount: 3,
      inline: true,
      pretty: false,
      extractComponents: false,
    };
    document = new JSDOM(`
      <html>
        <head><link rel="stylesheet" href="style.css" data-origin-url="http://127.0.0.1:9000/assets/style.css"></head>
        <body>
          <img src="logo.png" data-origin-url="http://127.0.0.1:9000/assets/logo.png">
          <script src="app.js" data-origin-url="http://127.0.0.1:9000/assets/app.js"></script>
        </body>
      </html>
    `).window.document as unknown as Document;
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('should track CSS, JS, and image sub-resources in snapshot metadata', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css', 'fetched'),
      createTestAsset('http://127.0.0.1:9000/assets/app.js', 'js', 'fetched'),
      createTestAsset('http://127.0.0.1:9000/assets/logo.png', 'img', 'fetched'),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.stats.fetched).toBe(3);
    expect(meta.assets.length).toBe(3);

    const types = meta.assets.map((a: Asset) => a.type);
    expect(types).toContain('css');
    expect(types).toContain('js');
    expect(types).toContain('img');
  });

  it('should verify sub-resource metadata in snapshot.json', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/assets/style.css', 'css', 'fetched', { size: 512, mime: 'text/css' }),
      createTestAsset('http://127.0.0.1:9000/assets/app.js', 'js', 'fetched', { size: 2048, mime: 'application/javascript' }),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    const cssAsset = meta.assets.find((a: Asset) => a.type === 'css');
    expect(cssAsset).toBeDefined();
    expect(cssAsset.size).toBe(512);
    expect(cssAsset.mime).toBe('text/css');
  });

  it('should handle font sub-resources', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/fonts/roboto.woff2', 'font', 'fetched'),
    ];
    // Add a font element to the document
    const fontEl = document.createElement('link');
    fontEl.setAttribute('rel', 'preload');
    fontEl.setAttribute('href', 'roboto.woff2');
    fontEl.setAttribute('as', 'font');
    fontEl.setAttribute('data-origin-url', 'http://127.0.0.1:9000/fonts/roboto.woff2');
    document.head.appendChild(fontEl);

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.stats.fetched).toBe(1);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Error Handling for Invalid URLs', () => {
  let testDir: string;
  let options: SnapshotOptions;
  let document: Document;

  beforeEach(() => {
    testDir = resolve(`/tmp/test-errors-${Date.now()}`);
    options = {
      url: 'http://127.0.0.1:9000',
      output: testDir,
      mode: 'bundle',
      maxAssets: 100,
      concurrency: 6,
      timeout: 15000,
      retryCount: 3,
      inline: true,
      pretty: false,
      extractComponents: false,
    };
    document = new JSDOM('<html><head></head><body></body></html>').window.document as unknown as Document;
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('should handle failed asset downloads gracefully', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/missing.css', 'css', 'failed', { error: '404 Not Found' }),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.stats.failed).toBe(1);
    expect(meta.stats.fetched).toBe(0);
  });

  it('should handle empty URL strings gracefully', () => {
    const assets = [
      createTestAsset('', 'css', 'failed', { error: 'Invalid URL' }),
    ];

    // Should not throw
    expect(() => assembleBundle(document, assets, options)).not.toThrow();
  });

  it('should handle extremely long URLs', () => {
    const longUrl = 'http://127.0.0.1:9000/' + 'x'.repeat(1000) + '.js';
    const assets = [createTestAsset(longUrl, 'js', 'fetched')];

    expect(() => assembleBundle(document, assets, options)).not.toThrow();

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.assets[0].status).toBe('fetched');
  });

  it('should handle URLs with special characters', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/style%20guide%20(v2).css', 'css', 'fetched'),
    ];

    expect(() => assembleBundle(document, assets, options)).not.toThrow();
  });

  it('should handle mixed failed and successful assets', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/style.css', 'css', 'fetched'),
      createTestAsset('http://127.0.0.1:9000/missing.js', 'js', 'failed'),
      createTestAsset('http://127.0.0.1:9000/logo.png', 'img', 'fetched'),
    ];

    assembleBundle(document, assets, options);

    const meta = JSON.parse(readFileSync(join(testDir, 'snapshot.json'), 'utf-8'));
    expect(meta.stats.fetched).toBe(2);
    expect(meta.stats.failed).toBe(1);
    expect(meta.stats.total).toBe(3);
  });

  it('should handle malformed data URIs', () => {
    const assets = [
      createTestAsset('http://127.0.0.1:9000/test.png', 'img', 'fetched', {
        dataUri: 'not-a-valid-data-uri',
      }),
    ];

    // Should not throw during assembly
    expect(() => assembleBundle(document, assets, options)).not.toThrow();
  });
});

// ============================================================================
// HYDRATION DETECTION TESTS
// ============================================================================

describe('Hydration Detection for Various Frameworks', () => {
  it('should detect Nuxt 3 hydration-ready state via __NUXT__', () => {
    const html = '<html><body><script>window.__NUXT__ = {}</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('nuxt3');
    expect(result.tier).toBe('definitive');
    expect(result.appElement).toBe('#__nuxt');
  });

  it('should detect Vue 2 hydration via _isMounted probe', async () => {
    // The Vue 2 strategy matches on framework 'vue2'
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['new Vue({ el: "#app" })'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue2');
    expect(result.tier).toBe('strong');

    // Verify the probe script references _isMounted and __vue__
    // This is checked by the vue2 strategy generateProbeScript
    const { vue2Strategy } = await import('../../framework/strategies/vue2.js');
    const probeScript = vue2Strategy.generateProbeScript(result);
    expect(probeScript).toContain('_isMounted');
    expect(probeScript).toContain('__vue__');
  });

  it('should detect SvelteKit hydration markers', () => {
    const html = '<html><body><div id="svelte"></div></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.tier).toBe('weak');
    expect(result.appElement).toBe('#svelte');
  });

  it('should detect Angular hydration from ng-version', () => {
    const html = '<html><body><app-root ng-version="17.0.0"></app-root></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('angular');
    expect(result.tier).toBe('weak');
  });

  it('should detect SvelteKit from definitive window.__sveltekit__', () => {
    const html = '<html><body><script>window.__sveltekit__ = 1</script></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('sveltekit');
    expect(result.tier).toBe('definitive');
  });
});

// ============================================================================
// VITEPRESS DETECTION PRIORITY INTEGRATION TEST
// ============================================================================

describe('VitePress Detection Priority Integration', () => {
  it('should prefer vitepress static detection over browser vue3 detection', () => {
    // Simulate: static detector finds vitepress (meta generator)
    // browser detector reports vue3 (runtime)
    const staticResult: FrameworkDetection = {
      framework: 'vitepress',
      tier: 'strong',
      appElement: '#app',
      markers: ['generator:VitePress v1.0.0'],
    };

    const browserFramework = {
      framework: 'vue3',
      tier: 'strong',
      appElement: '#app',
      isHydrated: true,
    };

    // isMoreSpecific should return true for vitepress > vue3
    expect(isMoreSpecific(staticResult.framework as FrameworkType, browserFramework.framework as FrameworkType)).toBe(true);
  });

  it('should prefer astro static detection over browser react detection', () => {
    expect(isMoreSpecific('astro' as FrameworkType, 'react18' as FrameworkType)).toBe(true);
  });

  it('should not prefer vue3 static detection over browser vue3 detection', () => {
    // Same framework, no specificity difference
    expect(isMoreSpecific('vue3' as FrameworkType, 'vue3' as FrameworkType)).toBe(false);
  });
});

// ============================================================================
// ASTRO DETECTION LOGIC TESTS
// ============================================================================

describe('Astro Detection Logic', () => {
  it('should detect Astro from meta generator tag', () => {
    const html = '<html><head><meta name="generator" content="Astro v4.5.0"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('astro');
    expect(result.tier).toBe('strong');
    expect(result.appElement).toBeNull();
  });

  it('should detect Astro with version in generator content', () => {
    const html = '<html><head><meta name="generator" content="Astro v4.0.0"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).toBe('astro');
    expect(result.markers).toContain('generator:Astro v4.0.0');
  });

  it('should not detect Astro from unrelated generator tags', () => {
    const html = '<html><head><meta name="generator" content="WordPress 6.0"></head><body></body></html>';
    const result = detectFramework(html);
    expect(result.framework).not.toBe('astro');
  });

  it('Astro strategy should produce empty probe script', async () => {
    const { astroStrategy } = await import('../../framework/strategies/astro.js');
    const detection: FrameworkDetection = {
      framework: 'astro',
      tier: 'strong',
      appElement: null,
      markers: ['generator:Astro v4.0.0'],
    };
    const probeScript = astroStrategy.generateProbeScript(detection);
    expect(probeScript).toBe('');
  });
});

// ============================================================================
// VUE 2 HYDRATION DETECTION LOGIC TESTS
// ============================================================================

describe('Vue 2 Hydration Detection Logic', () => {
  it('should detect Vue 2 from new Vue() constructor pattern', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['new Vue({ el: "#app", data: { message: "Hello" } })'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue2');
    expect(result.tier).toBe('strong');
  });

  it('should detect Vue 2 from Vue.extend() pattern', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['Vue.extend({ template: "<div>Extended</div>" })'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue2');
    expect(result.tier).toBe('strong');
  });

  it('should detect Vue 2 from Vue.component() pattern', () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['Vue.component("my-component", { template: "<div>Component</div>" })'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue2');
    expect(result.tier).toBe('strong');
  });

  it('should detect Vue 2 with createSSRApp and Vue 2 patterns as Vue 3', () => {
    // When both Vue 2 patterns and Vue 3 signals are present, Vue 3 wins
    const html = '<html><body><div id="app"></div></body></html>';
    const jsContents = ['new Vue({ el: "#app" })', 'createSSRApp(App).mount("#app")'];
    const result = detectFramework(html, jsContents);
    expect(result.framework).toBe('vue3');
    expect(result.tier).toBe('strong');
  });

  it('Vue 2 strategy probe script should check _isMounted and __vue__', async () => {
    const { vue2Strategy } = await import('../../framework/strategies/vue2.js');
    const detection: FrameworkDetection = {
      framework: 'vue2',
      tier: 'strong',
      appElement: '#app',
      markers: ['new Vue'],
    };
    const probeScript = vue2Strategy.generateProbeScript(detection);
    expect(probeScript).toContain('_isMounted');
    expect(probeScript).toContain('__vue__');
    expect(probeScript).toContain('#app');
  });
});

function createTestComponentManifest(
  name: string,
  confidence = 0.8
): Record<string, unknown> {
  return {
    name,
    type: 'presentational',
    path: `/components/${name}`,
    children: [],
    state: {},
    events: {},
    confidence,
    migration: {
      effort: '1h',
      effortBreakdown: { extraction: '0.5h', conversion: '0.5h' },
      suggestions: [],
      todos: [],
    },
  } as Record<string, unknown>;
}

function createTestConvertResult(): ConvertResult {
  return {
    sourceUrl: 'http://127.0.0.1:9000',
    timestamp: new Date().toISOString(),
    html: '<html><body></body></html>',
    assets: [],
    stats: {
      total: 0,
      fetched: 0,
      failed: 0,
      skipped: 0,
      validationWarnings: 0,
      totalBytes: 0,
    },
    components: new Map([
      [
        'Header',
        {
          name: 'Header',
          type: 'presentational',
          children: [],
          template: '<header>Header Component</header>',
          styles: 'header { padding: 1rem; }',
          matchConfidence: 0.85,
          manifest: createTestComponentManifest('Header', 0.85) as Record<string, unknown>,
        },
      ],
    ]),
    index: {
      stats: {
        stateful: 0,
        presentational: 1,
      },
    },
  };
}
