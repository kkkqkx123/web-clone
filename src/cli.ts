#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { snapshot, convertLocalSnapshot } from './assembler.js';
import { fromCommander, type CommanderOpts } from './config/index.js';

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
  .option('--memory-limit <mb>', 'Memory budget in MB for component extraction (requires --extract-components)', '1536')
  .option('--codegen-framework <type>', 'Generate framework code: vue | react | angular | svelte | jquery (requires --extract-components)')
  .option('--codegen-typescript', 'Use TypeScript for generated code (default: true)')
  .option('--codegen-css-modules', 'Use CSS Modules for React (default: false)')
  .option('--codegen-generate-drafts', 'Generate complete project templates in __drafts__/ (requires --codegen-framework)')
  .option('--codegen-extract-shared', 'Extract shared logic to shared/ directory (requires --extract-components)')
  .option('--skip-types <extensions>', 'Comma-separated extensions to skip (e.g. ".zip,.mp4"); empty string "" disables filtering; default: archives/installers/docs/video (archives: .zip, .rar, .7z, .tar, .gz, .bz2; installers: .exe, .msi, .dmg, .apk, .deb, .rpm; docs: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx; media: .mp4, .webm, .mp3, .wav, .m4v, .mkv, .avi, .mov, .flv, .aac, .flac, .ogg, .wma; other: .ts, .m3u8, .iso, .torrent, .wasm, .bin)')
  .option('--max-file-size <size>', 'Hard size limit per file, e.g. "50MB", "10m", or bytes (default: 50MB)')
  .option('--convert-local <path>', 'Run component extraction + codegen on an existing local bundle/single output directory (skips URL fetch)')
  .action(async (url: string, opts: CommanderOpts) => {
    const options = fromCommander(opts, url);
    const isLocal = !!opts.convertLocal;

    if (isLocal) {
      console.log(chalk.cyan('\n◉ Local Conversion\n'));
    } else {
      console.log(chalk.cyan('\n◉ Web Snapshot\n'));
    }

    const startTime = Date.now();

    try {
      const result = isLocal
        ? await convertLocalSnapshot(options)
        : await snapshot(options.url, options);

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
