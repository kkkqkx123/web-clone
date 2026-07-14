#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { snapshot, convertLocalSnapshot } from '@web-clone/core';
import { fromCommander, DEFAULTS, type CommanderOpts } from './config/index.js';
import type { SnapshotOptions, SnapshotResult } from '@web-clone/core';
import { validateSnapshot, cleanSnapshot, formatValidationReport, formatCleanResult } from '@web-clone/core';

const program = new Command();

program
  .name('snapshot')
  .description('Single-execution web page snapshot tool')
  .argument('[url]', 'Target page URL (optional when using --convert-local)')
  .option('-o, --output <path>', 'Output path', './snapshot')
  .option('-m, --mode <type>', 'Output mode: single | bundle', 'bundle')
  .option('--max-assets <number>', 'Maximum number of assets to download', '100')
  .option('--concurrency <number>', 'Number of concurrent downloads', '6')
  .option('--timeout <ms>', 'Per-resource timeout in milliseconds', '15000')
  .option('--retry-count <number>', 'Number of retries for failed downloads', '1')
  .option('--retry-initial-delay <ms>', 'Initial retry backoff delay in milliseconds (default: 200)')
  .option('--retry-max-delay <ms>', 'Maximum retry backoff delay in milliseconds (default: 2000)')
  .option('--no-inline', 'Skip inlining resources (data URIs)')
  .option('--pretty', 'Prettify output HTML')
  .option('--strict-status-codes', 'Require 2xx status code for all assets (default: lenient mode accepts 4xx/5xx CSS/JS with valid content)')
  .option('--extract-components', 'Extract component structure from the page')
  .option('--component-depth <n>', 'Limit component recognition to specified depth (no limit if not specified, requires --extract-components)')
  .option('--framework <hint>', 'Framework hint: vue | react | svelte (requires --extract-components)')
  .option('--extract-logic', 'Extract JavaScript logic (default: true, requires --extract-components)')
  .option('--component-filter <expr>', 'Filter components by expression, e.g. "confidence >= 0.7 && type == \'stateful\'" (requires --extract-components)')
  .option('--memory-limit <mb>', 'Memory budget in MB for component extraction (requires --extract-components)', '1536')
  .option('--codegen-framework <type>', 'Generate framework code: vue | react | angular | svelte | jquery (requires --extract-components)')
  .option('--codegen-typescript', 'Use TypeScript for generated code (default: true)')
  .option('--codegen-css-modules', 'Use CSS Modules for React (default: false)')
  .option('--codegen-generate-drafts', 'Generate complete project templates in __drafts__/ (requires --codegen-framework)')
  .option('--codegen-extract-shared', 'Extract shared logic to shared/ directory (requires --extract-components)')
  .option('--skip-types <extensions>', 'Comma-separated extensions to skip (e.g. ".zip,.mp4"); empty string "" disables filtering; default: archives/installers/docs (archives: .zip, .rar, .7z, .tar, .gz, .bz2; installers: .exe, .msi, .dmg, .apk, .deb, .rpm; docs: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx; media: .mp4, .webm, .mp3, .wav, .m4v, .mkv, .avi, .mov, .flv, .aac, .flac, .ogg, .wma; other: .ts, .m3u8, .iso, .torrent, .wasm, .bin)')
  .option('--resource-preset <name>', 'Resource filtering preset: none | minimal | default | no-media | aggressive (default: default; ignored when --skip-types is used)')
  .option('--include-wasm', 'Include .wasm files (remove from skip list)')
  .option('--include-bin', 'Include .bin files (remove from skip list)')
  .option('--include-video', 'Include video files (.mp4, .webm, .m3u8, .ts, etc.)')
  .option('--include-media', 'Include both video and audio files')
  .option('--include-fonts', 'Include font files (.woff, .woff2, .ttf, .otf)')
  .option('--include-all', 'Include ALL file types (same as --resource-preset none)')
  .option('--exclude-images', 'Exclude image files (.jpg, .png, .gif, etc.)')
  .option('--exclude-css', 'Exclude CSS files')
  .option('--exclude-js', 'Exclude JavaScript files')
  .option('--max-file-size <size>', 'Hard size limit per file, e.g. "50MB", "10m", or bytes (default: 50MB)')
  .option('--scan-depth <n>', 'Recursive resource scan depth (1 = current behavior; 2+ scans JS/CSS/JSON for hidden URLs)')
  .option('--scan-js', 'Scan JS files for embedded URLs during recursive discovery (default: true)')
  .option('--scan-json', 'Scan JSON files for media URLs during recursive discovery (default: false)')
  .option('--hybrid', 'Use browser for HTML rendering, HTTP pool for asset downloads (requires --adapter playwright|puppeteer)')
  .option('--adapter <type>', 'Browser automation adapter: playwright | puppeteer (default: http)')
  .option('--convert-local <path>', 'Run component extraction + codegen on an existing local bundle/single output directory (skips URL fetch)')
  .option('--serve', 'Start a local HTTP server to serve the snapshot (avoids file:// protocol restrictions)')
  .option('--serve-port <port>', 'Port for the HTTP server (default: 8080)', '8080')
  .action(async (url: string, opts: CommanderOpts) => {
    const options = fromCommander(opts, url);
    const isLocal = !!opts.convertLocal;

    if (isLocal) {
      console.log(chalk.cyan('\n◉ Local Conversion\n'));
    } else {
      console.log(chalk.cyan('\n◉ Web Snapshot\n'));
    }

    // Print effective options for diagnostics
    if (!isLocal) {
      console.log(chalk.gray(`  Options: maxAssets=${options.maxAssets}, concurrency=${options.concurrency}, timeout=${options.timeout}ms, mode=${options.mode}`));
      if (options.maxAssets === DEFAULTS.maxAssets) {
        console.log(chalk.gray(`  Tip: use --max-assets <n> or set MAX_ASSETS env var to change the asset limit`));
      }
    }

    const startTime = Date.now();

    try {
      let result: SnapshotResult;

      if (isLocal) {
        result = await convertLocalSnapshot(options);
      } else if (opts.adapter) {
        // ── Browser-based snapshot (Playwright / Puppeteer) ──
        const adapterType = opts.adapter.toLowerCase();
        if (adapterType !== 'playwright' && adapterType !== 'puppeteer') {
          console.error(chalk.red(`Invalid adapter type: "${opts.adapter}". Use "playwright" or "puppeteer".`));
          process.exit(1);
        }

        const { createBrowserAdapter, ensureBrowserDeps } = await import('./browser.js');

        // Check dependencies are installed before launching
        await ensureBrowserDeps(adapterType);

        console.log(chalk.gray(`  Adapter: ${adapterType}`));
        if (options.hybrid) {
          console.log(chalk.gray(`  Hybrid:  browser for HTML, HTTP for assets`));
        }

        const handle = await createBrowserAdapter(adapterType, {
          timeout: options.timeout,
        });

        try {
          // Use library-style overload: snapshot(options, adapter)
          result = await snapshot(options, handle.adapter);
        } finally {
          await handle.cleanup();
        }

        // Post-process: inject Vue/Nuxt hydration script for SSR snapshots.
        injectVueHydrationForCli(options);
      } else {
        // HTTP-based snapshot
        result = await snapshot(options.url, options);

        // Post-process: inject Vue/Nuxt hydration script for SSR snapshots.
        // This is a CLI-level optimization (not in the library) to help Vue
        // components hydrate properly when the snapshot is opened locally.
        injectVueHydrationForCli(options);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(chalk.green(`\n✓ ${isLocal ? 'Conversion' : 'Snapshot'} complete!`));
      console.log(`  Source: ${chalk.cyan(options.url)}`);
      console.log(`  Output: ${chalk.green(resolve(options.output))}`);
      console.log(`  Time:   ${chalk.white(`${elapsed}s`)}`);
      console.log('');

      if (isLocal) {
        console.log(`  ${chalk.white('Components:')}`);
        console.log(`    Total: ${result.stats.total}`);
        console.log(`    Stateful:     ${result.stats.stateful}`);
        console.log(`    Presentational: ${result.stats.presentational}`);
      } else {
        console.log(`  ${chalk.white('Stats:')}`);
        console.log(`    Total:  ${result.stats.total}`);
        console.log(`    ✓ ${chalk.green('Fetched')}: ${result.stats.fetched}`);
        console.log(`    ✗ ${chalk.red('Failed')}:  ${result.stats.failed}`);
        console.log(`    ⊘ ${chalk.yellow('Skipped')}: ${result.stats.skipped}`);
        console.log(`    Size:   ${formatBytes(result.stats.totalBytes)}`);

        if (result.stats.failed > 0) {
          console.log(chalk.yellow(`\n  ⚠ ${result.stats.failed} asset(s) failed to download`));
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(chalk.red(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }

    // ── Serve mode: start local HTTP server instead of exiting ──
    if (opts.serve && !isLocal) {
      const port = opts.servePort ? parseInt(opts.servePort, 10) : 8080;
      if (Number.isFinite(port) && port > 0 && port < 65536) {
        startStaticServer(options.output, port);
      } else {
        console.error(chalk.red(`Invalid --serve-port: "${opts.servePort}". Using 8080.`));
        startStaticServer(options.output, 8080);
      }
    } else {
      // Force exit to prevent idle sockets/agent timers from keeping the
      // event loop alive (Node.js 19+ default keepAlive with freeSocketTimeout=30s).
      process.exit(0);
    }
  });

// ─── inspect subcommand ───────────────────────────────────
program
  .command('inspect')
  .description('Analyze page structure — outline, locate, count, markdown')
  .argument('<url>', 'Target page URL')
  .option('--outline', 'Show structure outline (tag.class frequencies)')
  .option('--locate <text>', 'Find which selectors contain the given text')
  .option('--count <selector>', 'Count elements matching a CSS selector')
  .option('--md', 'Convert page to Markdown')
  .option('--json', 'Output in JSON format (for --locate)')
  .option('--limit <n>', 'Limit output items', '50')
  .option('--all', 'Show all results without limit')
  .option('--budget <n>', 'Cap output at ~N tokens')
  .action(async (url: string, opts: Record<string, unknown>) => {
    const { inspect } = await import('./commands/inspect.js');
    await inspect(url, {
      outline: opts.outline === true,
      locate: opts.locate as string | undefined,
      count: opts.count as string | undefined,
      md: opts.md === true,
      json: opts.json === true,
      limit: opts.limit ? Number(opts.limit) : 50,
      all: opts.all === true,
      budget: opts.budget ? Number(opts.budget) : 0,
    });
  });

// ─── query subcommand ─────────────────────────────────────
program
  .command('query')
  .description('Extract structured data from HTML using CSS selectors')
  .argument('<url>', 'Target page URL')
  .argument('<selector>', 'CSS selector to match elements')
  .option('--row <spec>', 'Extract structured rows (name=selector, name2=sel@attr)')
  .option('--table', 'Parse HTML table into structured rows')
  .option('--where <expr>', 'Filter rows with expression language (e.g. "age >= 18")')
  .option('--attr <name>', 'Extract a single attribute from each match')
  .option('--count', 'Just count matching elements')
  .option('--html', 'Extract inner HTML')
  .option('--json', 'Output in JSON format')
  .option('--tsv', 'Output in TSV format')
  .option('--limit <n>', 'Limit output items', '50')
  .option('--all', 'Show all results without limit')
  .option('--budget <n>', 'Cap output at ~N tokens')
  .action(async (url: string, selector: string, opts: Record<string, unknown>) => {
    const { query } = await import('./commands/query.js');
    await query(url, selector, {
      row: opts.row as string | undefined,
      table: opts.table === true,
      where: opts.where as string | undefined,
      attr: opts.attr as string | undefined,
      count: opts.count === true,
      html: opts.html === true,
      json: opts.json === true,
      tsv: opts.tsv === true,
      limit: opts.limit ? Number(opts.limit) : 50,
      all: opts.all === true,
      budget: opts.budget ? Number(opts.budget) : 0,
    });
  });

// ─── validate subcommand ──────────────────────────────────
program
  .command('validate <output-dir>')
  .description('Validate a downloaded snapshot directory for integrity issues')
  .action((outputDir: string) => {
    console.log(chalk.cyan('\n◉ Validating snapshot...\n'));
    const report = validateSnapshot(outputDir);
    console.log(formatValidationReport(report));
    process.exit(report.failed > 0 ? 1 : 0);
  });

// ─── clean subcommand ─────────────────────────────────────
program
  .command('clean <output-dir>')
  .description('Remove corrupted or zero-length files from a snapshot directory')
  .option('--dry-run', 'Show what would be removed without actually removing')
  .option('--no-zero-byte', 'Skip zero-length file removal')
  .option('--no-corrupted', 'Skip corrupted file removal')
  .option('--re-download', 'Re-download removed assets if origin URL is known (reads snapshot.json)')
  .action(async (outputDir: string, opts: { dryRun?: boolean; zeroByte?: boolean; corrupted?: boolean; reDownload?: boolean }) => {
    console.log(chalk.cyan('\n◉ Cleaning snapshot...\n'));

    // Prepare download function if re-download is enabled
    let downloadFn: import('@web-clone/core').DownloadFn | undefined;
    if (opts.reDownload) {
      const { HttpFetcherAdapter } = await import('@web-clone/core');
      const { writeFile } = await import('node:fs/promises');
      const adapter = new HttpFetcherAdapter();
      downloadFn = async (url: string, localPath: string) => {
        try {
          const result = await adapter.fetch(url, { timeout: 15000 });
          if (result.ok) {
            await writeFile(localPath, result.buffer);
            return true;
          }
          return false;
        } catch {
          return false;
        }
      };
    }

    const result = await cleanSnapshot(outputDir, {
      dryRun: opts.dryRun ?? false,
      removeZeroByte: opts.zeroByte !== false,
      removeCorrupted: opts.corrupted !== false,
      removeExternalRefs: false,
      reDownload: opts.reDownload ?? false,
    }, downloadFn);
    console.log(formatCleanResult(result));

    // Log re-download results
    if (result.reDownloadedFiles && result.reDownloadedFiles.length > 0) {
      console.log(chalk.green(`\n✓ Re-downloaded ${result.reDownloadedFiles.length} asset(s):`));
      for (const f of result.reDownloadedFiles) {
        console.log(`  ✓ ${f.url} → ${f.localPath}`);
      }
    }
    if (result.reDownloadErrors && result.reDownloadErrors.length > 0) {
      console.log(chalk.red(`\n✗ Failed to re-download ${result.reDownloadErrors.length} asset(s):`));
      for (const f of result.reDownloadErrors) {
        console.log(`  ✗ ${f.url}: ${f.error}`);
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  });

// Only parse arguments when cli.ts is the entry point, not when imported as a module
// This prevents side effects when vitest imports this file for testing
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('cli.js') ||
  process.argv[1].endsWith('cli.ts') ||
  (typeof import.meta !== 'undefined' && process.argv[1] === fileURLToPath(import.meta.url))
);
if (isDirectRun) {
  // pnpm (especially on Windows/Git Bash) passes "--" as a literal argument
  // when using the `--` passthrough separator. Filter it out before Commander
  // parses the args, otherwise Commander treats "--" as "end of options" and
  // all subsequent args become positional, causing "too many arguments".
  const filteredArgs = process.argv.filter(a => a !== '--');
  program.parse(filteredArgs);
}
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ──────────────────────────────────────────────────────────────
// Static file server for --serve mode
// ──────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function startStaticServer(rootDir: string, port: number): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let urlPath = req.url || '/';
    // Strip query string for file lookup
    const queryIdx = urlPath.indexOf('?');
    if (queryIdx !== -1) urlPath = urlPath.substring(0, queryIdx);

    // Normalize: default to index.html for directories
    const filePath = urlPath.endsWith('/')
      ? join(rootDir, urlPath, 'index.html')
      : join(rootDir, urlPath);

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = createReadStream(filePath);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
    });
    stream.on('error', () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  });

  server.listen(port, () => {
    process.stdout.write(`\n  Snapshot served at: ${chalk.green(`http://localhost:${port}`)}\n`);
    process.stdout.write(`  Press ${chalk.bold('Ctrl+C')} to stop.\n\n`);
  });
}

/**
 * CLI post-processing: inject Vue/Nuxt hydration script into the output HTML.
 *
 * This was moved from the library (assembler.ts) to the CLI layer to keep the
 * library framework-agnostic. It performs string-based injection (no JSDOM
 * dependency needed in the CLI).
 *
 * The script helps Vue/Nuxt SSR snapshots hydrate properly when opened locally.
 *
 * @internal Exported for unit testing purposes.
 */
export function injectVueHydrationForCli(options: SnapshotOptions): void {
  // Determine the output HTML file path
  const htmlPath = options.mode === 'bundle'
    ? join(options.output, 'index.html')
    : options.output;

  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf8');
  } catch {
    // File not found or unreadable — silently skip
    return;
  }

  // Only inject if the page has Vue/Nuxt app markers
  if (!html.includes('id="__nuxt"') && !html.includes('id="app"')) {
    return;
  }

  const hydrationScript = `<script type="text/javascript">
(function() {
  var retries = 0;
  var maxRetries = 20;
  var delay = 500;

  function tryHydrate() {
    var appEl = document.querySelector('#__nuxt') || document.querySelector('#app');
    if (!appEl) return;
    if (appEl.__vue__) {
      console.log('[Snapshot Hydration] Vue already hydrated');
      return;
    }
    if (window.__NUXT__) {
      console.log('[Snapshot Hydration] Attempting to trigger Vue hydration...');
      if (window.$nuxt && window.$nuxt.$mount) {
        try {
          window.$nuxt.$mount('#__nuxt');
          console.log('[Snapshot Hydration] Nuxt 2.x mount triggered');
          return;
        } catch (e) {
          console.log('[Snapshot Hydration] Nuxt 2.x mount failed:', e.message);
        }
      }
      if (window.$nuxt && window.$nuxt.$el) {
        console.log('[Snapshot Hydration] Nuxt 3.x already initialized');
        return;
      }
    }
    retries++;
    if (retries < maxRetries) {
      setTimeout(tryHydrate, delay);
    } else {
      console.log('[Snapshot Hydration] Max retries reached, hydration may be incomplete');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryHydrate);
  } else {
    setTimeout(tryHydrate, 100);
  }
})();
<\/script>`;

  // Inject before </body>
  const modifiedHtml = html.replace('</body>', hydrationScript + '\n</body>');
  if (modifiedHtml !== html) {
    writeFileSync(htmlPath, modifiedHtml, 'utf8');
  }
}
