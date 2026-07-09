import { extname } from 'node:path';
import { type Asset } from './types.js';

const MAGIC_BYTES: Record<string, number[]> = {
  '.png': [0x89, 0x50, 0x4e, 0x47],
  '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff],
  '.gif': [0x47, 0x49, 0x46],
  '.webp': [0x52, 0x49, 0x46, 0x46],
  '.wasm': [0x00, 0x61, 0x73, 0x6d],
  '.woff': [0x77, 0x4f, 0x46, 0x46],
  '.woff2': [0x77, 0x4f, 0x46, 0x32],
  '.ktx': [0xab, 0x4b, 0x54, 0x58],
  '.ktx2': [0xab, 0x4b, 0x54, 0x58],
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);

const TEXT_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.txt']);

export function isHtmlLike(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<title>');
}

export function hasExpectedMagic(filePath: string, buffer: Buffer): boolean {
  const ext = extname(filePath).toLowerCase();
  const magic = MAGIC_BYTES[ext];
  if (!magic) return true;
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

export function isValidCachedResponse(filePath: string, contentType: string, buffer: Buffer): boolean {
  const ext = extname(filePath).toLowerCase();
  const ct = contentType.toLowerCase();

  if (isHtmlLike(buffer) && ext !== '.html' && ext !== '') {
    return false;
  }

  if (ext === '.json') {
    try {
      JSON.parse(buffer.toString('utf8'));
      return true;
    } catch {
      return false;
    }
  }

  if (ext === '.js' || ext === '.mjs') {
    return !ct.includes('text/html');
  }

  if (IMAGE_EXTS.has(ext) && ct.startsWith('image/')) {
    return true;
  }

  if (TEXT_EXTS.has(ext)) {
    return true;
  }

  return hasExpectedMagic(filePath, buffer);
}

export function mimeFromExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.otf': 'font/opentype',
    '.ttf': 'font/ttf',
    '.bin': 'application/octet-stream',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export function postDownloadValidation(assets: Asset[]): Array<{url: string, error: string}> {
  const failures: Array<{url: string, error: string}> = [];

  for (const a of assets) {
    if (a.status !== 'fetched') continue;
    
    if (a.type === 'css' && a.textContent) {
      try {
        const hasMissingUrl = /url\(["']?[^)"']*\.(png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf|svg)["']?\)/gi.test(a.textContent);
        if (hasMissingUrl) {
          failures.push({ url: a.originUrl, error: 'CSS contains missing font/image references' });
        }
      } catch {}
    }
    
    if (a.size === 0 && a.mime === 'application/octet-stream') {
      failures.push({ url: a.originUrl, error: 'Zero-length or generic octet-stream response' });
    }
  }
  
  return failures;
}
