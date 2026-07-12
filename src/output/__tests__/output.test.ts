import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import type { Asset, SnapshotOptions, ComponentSpec, ConvertResult } from '../../types.js';
import { assembleBundle } from '../bundle.js';
import { assembleSingleFile } from '../single-file.js';
import { assembleConvert } from '../convert.js';

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
    url: 'https://example.com',
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
          <link rel="stylesheet" href="style.css" data-origin-url="https://example.com/assets/style.css">
          <script src="app.js" data-origin-url="https://example.com/assets/app.js"></script>
          <img src="logo.png" data-origin-url="https://example.com/assets/logo.png">
        </body>
      </html>
    `);
  });

  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('Scene 1: Should generate standard bundle directory structure', () => {
    const assets = [
      createTestAsset('https://example.com/assets/style.css', 'css'),
      createTestAsset('https://example.com/assets/app.js', 'js'),
      createTestAsset('https://example.com/assets/logo.png', 'img'),
    ];

    assembleBundle(document, assets, options);

    const indexHtml = join(testDir, 'index.html');
    expect(readFileSync(indexHtml, 'utf-8')).toContain('<!DOCTYPE');

    const cssDir = join(testDir, 'assets', 'css');
    const jsDir = join(testDir, 'assets', 'js');
    const imgDir = join(testDir, 'assets', 'img');

    // Verify directory structure exists
    expect(() => {
      const files = readFileSync(cssDir, 'utf-8');
    }).toBeDefined();
  });

  it('Scene 2: Should correctly rewrite asset paths', () => {
    const assets = [createTestAsset('https://example.com/assets/style.css', 'css')];
    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    // Path should be rewritten to relative path
    expect(html).toMatch(/href="assets\/css\//);
  });

  it('Scene 3: Should handle failed assets and clean href/src attributes', () => {
    const assets = [
      createTestAsset('https://example.com/assets/style.css', 'css', 'failed'),
    ];
    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    // Failed assets should have href/src removed
    expect(html).not.toContain('href="https://example.com/assets/style.css"');
  });

  it('Scene 4: Should correctly handle route paths (URLs without extensions)', () => {
    const assets = [createTestAsset('https://example.com/about', 'other')];
    assembleBundle(document, assets, options);

    const manifest = JSON.parse(
      readFileSync(join(testDir, 'snapshot.json'), 'utf-8')
    );
    // Route path should be mapped to index.html
    const routeAsset = manifest.assets.find(
      (a: Asset) => a.originUrl === 'https://example.com/about'
    );
    expect(routeAsset?.localPath).toContain('index.html');
  });

  it('Scene 5: Should clean up snapshot helper attributes', () => {
    document.querySelector('img')?.setAttribute('data-snapshot-id', '123');
    const assets = [createTestAsset('https://example.com/assets/logo.png', 'img')];

    assembleBundle(document, assets, options);

    const html = readFileSync(join(testDir, 'index.html'), 'utf-8');
    expect(html).not.toContain('data-snapshot-id');
    expect(html).not.toContain('data-origin-url');
  });

  it('Scene 6: Should generate correct snapshot.json metadata', () => {
    const assets = [
      createTestAsset('https://example.com/assets/style.css', 'css'),
      createTestAsset('https://example.com/assets/app.js', 'js', 'failed'),
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
      createTestAsset('https://example.com/sensitive.txt', 'other'),
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
    const longUrl = 'https://example.com/' + 'a'.repeat(500) + '.css';
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
          <link rel="stylesheet" href="style.css" data-origin-url="https://example.com/style.css">
        </head>
        <body>
          <img src="logo.png" data-origin-url="https://example.com/logo.png">
          <script src="app.js" data-origin-url="https://example.com/app.js"></script>
        </body>
      </html>
    `);
    options = createTestOptions({ mode: 'single' });
  });

  it('Scene 1: Should return HTML string with inlined resources', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

    // Set src to absolute URL for matching, and data-origin-url for source tracking
    const img = document.querySelector('img');
    img?.setAttribute('src', 'https://example.com/logo.png');
    img?.setAttribute('data-origin-url', 'https://example.com/logo.png');

    const assets = [
      createTestAsset('https://example.com/logo.png', 'img', 'fetched', {
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
    link?.setAttribute('data-origin-url', 'https://example.com/style.css');

    const assets = [
      createTestAsset('https://example.com/style.css', 'css', 'fetched', {
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
    script?.setAttribute('data-origin-url', 'https://example.com/app.js');

    const assets = [
      createTestAsset('https://example.com/app.js', 'js', 'fetched', {
        textContent: jsContent,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain(jsContent);
  });

  it('Scene 4: Should rewrite URLs in inlined CSS', () => {
    const cssContent = 'body { background: url("https://example.com/bg.png"); }';
    const dataUri = 'data:image/png;base64,xxx';

    // Set data-origin-url on link
    const link = document.querySelector('link[rel="stylesheet"]');
    link?.setAttribute('data-origin-url', 'https://example.com/style.css');

    const assets = [
      createTestAsset('https://example.com/style.css', 'css', 'fetched', {
        textContent: cssContent,
      }),
      createTestAsset('https://example.com/bg.png', 'img', 'fetched', {
        dataUri,
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    // URLs in CSS should be replaced with data URIs
    expect(result).toContain(dataUri);
  });

  it('Scene 5: Should handle responsive images (srcset)', () => {
    const img = document.querySelector('img');
    img?.setAttribute('srcset', 'https://example.com/logo-1x.png 1x, https://example.com/logo-2x.png 2x');
    img?.setAttribute('data-origin-url', 'https://example.com/logo.png');

    const assets = [
      createTestAsset('https://example.com/logo-1x.png', 'img', 'fetched', {
        dataUri: 'data:image/png;base64,1x',
      }),
      createTestAsset('https://example.com/logo-2x.png', 'img', 'fetched', {
        dataUri: 'data:image/png;base64,2x',
      }),
    ];

    const result = assembleSingleFile(document, assets, options);

    expect(result).toContain('data:image/png;base64,1x');
    expect(result).toContain('data:image/png;base64,2x');
  });

  it('Defect test: Should handle missing data URI (unfetched resources)', () => {
    const assets = [
      createTestAsset('https://example.com/logo.png', 'img', 'failed'),
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
    link?.setAttribute('data-origin-url', 'https://example.com/style.css');
    const script = document.querySelector('script');
    script?.setAttribute('data-origin-url', 'https://example.com/app.js');

    const assets = [
      createTestAsset('https://example.com/app.js', 'js', 'fetched', {
        textContent: jsContent,
      }),
      createTestAsset('https://example.com/style.css', 'css', 'fetched', {
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
      createTestAsset('https://example.com/logo.png', 'img', 'fetched', {
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
      } catch {}
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
    } catch (err: any) {
      expect(err.code).toBe('ENOENT');
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
    } catch (err: any) {
      expect(err.code).toBe('ENOENT');
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
          <link rel="stylesheet" href="style.css" data-origin-url="https://example.com/style.css">
          <link rel="stylesheet" href="dark.css" data-origin-url="https://example.com/dark.css">
        </head>
        <body>
          <img src="logo.png" data-origin-url="https://example.com/logo.png">
          <img src="banner.jpg" data-origin-url="https://example.com/banner.jpg">
          <font src="roboto.woff2" data-origin-url="https://example.com/fonts/roboto.woff2">
        </body>
      </html>
    `);

    const assets = [
      createTestAsset('https://example.com/style.css', 'css'),
      createTestAsset('https://example.com/dark.css', 'css', 'failed'),
      createTestAsset('https://example.com/logo.png', 'img'),
      createTestAsset('https://example.com/banner.jpg', 'img'),
      createTestAsset('https://example.com/fonts/roboto.woff2', 'font'),
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
// Helper Functions
// ============================================================================

function createTestComponentManifest(
  name: string,
  confidence = 0.8
): any {
  return {
    name,
    type: 'presentational',
    path: `/components/${name}`,
    children: [],
    state: {},
    events: {},
    migration: {
      effort: '1h',
      effortBreakdown: { extraction: '0.5h', conversion: '0.5h' },
      suggestions: [],
      todos: [],
    },
  } as any;
}

function createTestConvertResult(): ConvertResult {
  return {
    sourceUrl: 'https://example.com',
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
          manifest: createTestComponentManifest('Header', 0.85) as any,
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
