export function resolveUrl(raw: string, baseUrl: string): string | null {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) {
    return null;
  }

  try {
    if (raw.startsWith('//')) {
      const base = new URL(baseUrl);
      return new URL(raw, `${base.protocol}${raw}`).href;
    }
    
    // Check if it's a path that looks like a mirrored remote host (e.g., /cdn.example.com/path)
    if (raw.startsWith('/')) {
      const parts = raw.split('/').filter(Boolean);
      if (parts.length > 1 && looksLikeMirroredRemoteHost(parts[0])) {
        return `https://${parts[0]}/${parts.slice(1).join('/')}`;
      }
    }
    
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

export function looksLikeMirroredRemoteHost(segment: string): boolean {
  return /^[a-z0-9-]+(\\.[a-z0-9-]+){2,}$/i.test(segment);
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

export function parseSrcset(srcset: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const part of srcset.split(',')) {
    const trimmed = part.trim();
    const match = trimmed.match(/^(\S+)/);
    if (match) {
      const resolved = resolveUrl(match[1], baseUrl);
      if (resolved) urls.push(resolved);
    }
  }
  return urls;
}
