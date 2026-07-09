import { type Asset, type SnapshotOptions } from '../types.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function rewriteUrls(text: string, urlMap: Map<string, string>): string {
  let result = text;
  for (const [original, replacement] of urlMap) {
    result = result.split(original).join(replacement);
  }
  return result;
}

export function assembleSingleFile(
  document: Document,
  assets: Asset[],
  options: SnapshotOptions,
): string {
  const urlMap = new Map<string, string>();
  for (const a of assets) {
    if (a.status === 'fetched' && a.dataUri) {
      urlMap.set(a.originUrl, a.dataUri);
    }
  }

  const cssContentMap = new Map<string, string>();
  const jsContentMap = new Map<string, string>();
  for (const a of assets) {
    if (a.status === 'fetched' && a.textContent) {
      if (a.type === 'css') cssContentMap.set(a.originUrl, a.textContent);
      else if (a.type === 'js') jsContentMap.set(a.originUrl, a.textContent);
    }
  }

  const linkSelectors = [...document.querySelectorAll('link[rel="stylesheet"][href]')];
  for (const link of linkSelectors) {
    const href = link.getAttribute('href');
    if (!href) continue;
    const cssText = cssContentMap.get(href) || cssContentMap.get(href.split('?')[0]) || '';
    if (!cssText) continue;

    const style = document.createElement('style');
    style.setAttribute('data-origin-url', href);
    const rewritten = rewriteUrls(cssText, urlMap);
    style.textContent = `/* Source: ${esc(href)} */\n${rewritten}`;
    link.replaceWith(style);
  }

  const scriptSelectors = [...document.querySelectorAll('script[src]')];
  for (const script of scriptSelectors) {
    const src = script.getAttribute('src');
    if (!src) continue;
    const jsText = jsContentMap.get(src) || '';
    if (!jsText) continue;

    script.removeAttribute('src');
    script.setAttribute('data-origin-url', src);
    script.textContent = jsText;
  }

  for (const a of assets) {
    if (a.status !== 'fetched' || !a.dataUri) continue;
    const uri = a.dataUri;

    const imgs = [...document.querySelectorAll(`img[src="${esc(a.originUrl)}"]`)];
    for (const img of imgs) img.setAttribute('src', uri);

    const srcsetImgs = [...document.querySelectorAll('img[srcset]')];
    for (const img of srcsetImgs) {
      const val = img.getAttribute('srcset');
      if (val && val.includes(a.originUrl)) {
        img.setAttribute('srcset', val.split(a.originUrl).join(uri));
      }
    }

    const sourceSrcset = [...document.querySelectorAll('source[srcset]')];
    for (const src of sourceSrcset) {
      const val = src.getAttribute('srcset');
      if (val && val.includes(a.originUrl)) {
        src.setAttribute('srcset', val.split(a.originUrl).join(uri));
      }
    }
  }

  const styleEls = [...document.querySelectorAll('style:not([data-origin-url])')];
  for (const el of styleEls) {
    const text = el.textContent || '';
    if (text) {
      el.textContent = rewriteUrls(text, urlMap);
    }
  }

  const head = document.querySelector('head');
  if (head) {
    const metaSource = document.createElement('meta');
    metaSource.setAttribute('name', 'snapshot:source');
    metaSource.setAttribute('content', options.url);
    head.prepend(metaSource);

    const metaTime = document.createElement('meta');
    metaTime.setAttribute('name', 'snapshot:time');
    metaTime.setAttribute('content', new Date().toISOString());
    head.insertBefore(metaTime, metaSource.nextSibling!);
  }

  const body = document.querySelector('body');

  let html = document.toString();
  if (!html.startsWith('<!')) {
    html = '<!DOCTYPE html>\n' + html;
  }

  if (options.pretty) {
    html = html.replace(/>\s+</g, '>\n<');
  }

  return html;
}
