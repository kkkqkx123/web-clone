#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { snapshot, convertLocalSnapshot } from './assembler.js';
import { type SnapshotOptions } from './types.js';
import { DEFAULT_MAX_FILE_SIZE } from './validators.js';

interface CommandOptions {
  output: string;
  mode: string;
  maxAssets: string;
  concurrency: string;
  timeout: string;
  retryCount: string;
  inline: boolean;
  pretty: boolean;
  extractComponents: boolean;
  componentDepth?: string;
  framework?: string;
  extractLogic: string;
  memoryLimit: string;
  codegenFramework?: string;
  codegenTypescript: string;
  codegenCssModules: string;
  codegenGenerateDrafts: string;
  codegenExtractShared: string;
  skipTypes?: string;
  maxFileSize?: string;
  convertLocal?: string;
}

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
  .option('--no-inline', 'Skip inlining resources (data URIs)')
  .option('--pretty', 'Prettify output HTML')
  .option('--extract-components', 'Extract component structure from the page')
  .option('--component-depth <n>', 'Limit component recognition to specified depth (no limit if not specified, requires --extract-components)')
  .option('--framework <hint>', 'Framework hint: vue | react | svelte (requires --extract-components)')
  .option('--extract-logic', 'Extract JavaScript logic (default: true, requires --extract-components)')
  .option('--memory-limit <mb>', 'Memory budget in MB for component extraction (requires --extract-components)', '1536')
  .option('--codegen-framework <type>', 'Generate framework code: vue | react | angular | svelte | jquery (requires --extract-components)')
  .option('--codegen-typescript', 'Use TypeScript for generated code (default: true)')
  .option('--codegen-css-modules', 'Use CSS Modules for React (default: false)')
  .option('--codegen-generate-drafts', 'Generate complete project templates in __drafts__/ (requires --codegen-framework)')
  .option('--codegen-extract-shared', 'Extract shared logic to shared/ directory (requires --extract-components)')
  .option('--skip-types <extensions>', 'Comma-separated extensions to skip (e.g. ".zip,.mp4,.ts"); empty to disable filtering')
  .option('--max-file-size <size>', 'Hard size limit per file, e.g. "50MB", "10m", or bytes (default: 50MB)')
  .option('--convert-local <path>', 'Run component extraction + codegen on an existing local bundle/single output directory (skips URL fetch)')
  .action(async (url: string, opts: CommandOptions) => {
    const isLocal = !!opts.convertLocal;

    // When --convert-local is used, default output to the same directory
    const outputPath = isLocal && opts.output === './snapshot'
      ? opts.convertLocal
      : opts.output;

    const options: SnapshotOptions = {
      url: isLocal ? (opts.convertLocal ?? '') : (url ?? ''),
      output: outputPath || './snapshot',
      mode: (opts.mode as 'single' | 'bundle') || 'bundle',
      maxAssets: parseInt(opts.maxAssets, 10),
      concurrency: parseInt(opts.concurrency, 10),
      timeout: parseInt(opts.timeout, 10),
      retryCount: parseInt(opts.retryCount, 10),
      inline: opts.inline !== false,
      pretty: opts.pretty || false,
      extractComponents: isLocal ? true : (opts.extractComponents || false),
      convertLocal: opts.convertLocal || undefined,
    };

    // Component extraction options apply when --extract-components or --convert-local is specified
    if (options.extractComponents) {
      options.componentDepth = opts.componentDepth ? parseInt(opts.componentDepth, 10) : undefined;
      options.frameworkHint = (opts.framework || undefined) as 'vue' | 'react' | 'svelte' | undefined;
      options.extractLogic = opts.extractLogic !== 'false';

      // Framework code generation options
      if (opts.codegenFramework) {
        options.frameworkCodegen = {
          framework: opts.codegenFramework as 'vue' | 'react' | 'angular' | 'svelte' | 'jquery',
          typescript: opts.codegenTypescript !== 'false',
          cssModules: opts.codegenCssModules === 'true',
          generateDrafts: opts.codegenGenerateDrafts === 'true',
          extractSharedLogic: opts.codegenExtractShared === 'true',
        };
      }
    }

    // Resource filtering options (only relevant for fetch mode)
    if (!isLocal) {
      if (opts.skipTypes !== undefined) {
        options.skipExtensions = opts.skipTypes
          ? opts.skipTypes.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
      }
      options.maxFileSize = opts.maxFileSize !== undefined
        ? parseFileSize(opts.maxFileSize)
        : DEFAULT_MAX_FILE_SIZE;
    }

    if (isLocal) {
      console.log(chalk.cyan('\n◉ Local Conversion\n'));
    } else {
      console.log(chalk.cyan('\n◉ Web Snapshot\n'));
    }

    const startTime = Date.now();

    try {
      const result = isLocal
        ? await convertLocalSnapshot(options)
        : await snapshot(options.url, {
            output: options.output,
            mode: options.mode,
            maxAssets: options.maxAssets,
            concurrency: options.concurrency,
            timeout: options.timeout,
            retryCount: options.retryCount,
            inline: options.inline,
            pretty: options.pretty,
            extractComponents: options.extractComponents,
            componentDepth: options.componentDepth,
            frameworkHint: options.frameworkHint,
            extractLogic: options.extractLogic,
            frameworkCodegen: options.frameworkCodegen,
            skipExtensions: options.skipExtensions,
            maxFileSize: options.maxFileSize,
          });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(chalk.green(`\n✓ ${isLocal ? 'Conversion' : 'Snapshot'} complete!`));
      console.log(`  Source: ${chalk.cyan(options.url)}`);
      console.log(`  Output: ${chalk.green(options.output)}`);
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
  });

program.parse(process.argv);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function parseFileSize(val: string): number {
  const m = val.match(/^(\d+(?:\.\d+)?)\s*(k|m|g|kb|mb|gb)?$/i);
  if (!m) return parseInt(val, 10) || 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'kb') return Math.round(num * 1024);
  if (unit === 'm' || unit === 'mb') return Math.round(num * 1024 * 1024);
  if (unit === 'g' || unit === 'gb') return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num);
}
