export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
}

function isEdgeDevToolsFormat(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const first = lines[0];
  const parts = first.split('\t');
  // Edge export has 11 columns: Name Value Domain Path Expires/Max-Age Size HttpOnly Secure SameSite PartitionedKey Priority
  // But sometimes PartitionedKey is missing, so we check for at least 9-11 columns
  if (parts.length < 9) return false;
  // Check header or first data row indicators
  const headerOrFirst = parts.map((p) => p.trim().toLowerCase());
  const hasDomainColumn = headerOrFirst[2]?.startsWith('.') || headerOrFirst[2]?.includes('jjwxc') || headerOrFirst[2]?.includes('baidu');
  const hasPathColumn = headerOrFirst[3] === '/';
  const hasSizeColumn = /^\d+$/.test(parts[5]);
  const hasPriorityColumn = parts[parts.length - 1].toLowerCase() === 'medium' || parts[parts.length - 1].toLowerCase() === 'high' || parts[parts.length - 1].toLowerCase() === 'low';
  return hasPathColumn && (hasDomainColumn || hasSizeColumn || hasPriorityColumn);
}

function parseEdgeDevToolsFormat(text: string): ParsedCookie[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const cookies: ParsedCookie[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 6) continue;

    const name = parts[0]?.trim();
    const value = parts[1]?.trim();
    const domain = parts[2]?.trim();

    if (!name || value === undefined) continue;
    cookies.push({ name, value, domain });
  }

  return cookies;
}

function isNetscapeFormat(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const first = lines[0];
  const parts = first.split('\t');
  if (parts.length !== 7) return false;
  // Netscape: domain, flag, path, secure, expires, name, value
  const domain = parts[0]?.trim();
  const flag = parts[1]?.trim();
  const path = parts[2]?.trim();
  const secure = parts[3]?.trim();
  const expires = parts[4]?.trim();
  return (domain.startsWith('.') || domain.startsWith('#HttpOnly_')) &&
    (flag === 'TRUE' || flag === 'FALSE') &&
    path === '/' &&
    (secure === 'TRUE' || secure === 'FALSE') &&
    /^\d+$/.test(expires);
}

function parseNetscapeFormat(text: string): ParsedCookie[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
  const cookies: ParsedCookie[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length !== 7) continue;
    const domain = parts[0].trim();
    const path = parts[2].trim();
    const name = parts[5].trim();
    const value = parts[6].trim();
    if (!name) continue;
    cookies.push({ name, value, domain });
  }

  return cookies;
}

function isJsonFormat(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']');
}

function parseJsonFormat(text: string): ParsedCookie[] {
  try {
    const arr = JSON.parse(text) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null;
        const obj = item as Record<string, unknown>;
        const name = String(obj.name ?? obj.Name ?? '');
        const value = String(obj.value ?? obj.Value ?? '');
        const domain = String(obj.domain ?? obj.Domain ?? '');
        if (!name) return null;
        return { name, value, domain };
      })
      .filter((c): c is ParsedCookie => c !== null);
  } catch {
    return [];
  }
}

function isCookieString(text: string): boolean {
  // Simple heuristic: contains semicolons and equals signs, no newlines or tabs
  const trimmed = text.trim();
  if (trimmed.includes('\t')) return false;
  if (trimmed.includes('\n')) return false;
  return trimmed.includes('=') && trimmed.includes(';');
}

function parseCookieString(text: string): ParsedCookie[] {
  const pairs = text.split(';').map((p) => p.trim()).filter((p) => p.includes('='));
  return pairs.map((pair) => {
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    return { name, value };
  });
}

export function autoParseCookies(text: string): { cookies: ParsedCookie[]; format: string } {
  const trimmed = text.trim();
  if (!trimmed) return { cookies: [], format: 'empty' };

  const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Try Edge DevTools format
  if (isEdgeDevToolsFormat(lines)) {
    return { cookies: parseEdgeDevToolsFormat(trimmed), format: 'edge' };
  }

  // Try Netscape format
  if (isNetscapeFormat(lines)) {
    return { cookies: parseNetscapeFormat(trimmed), format: 'netscape' };
  }

  // Try JSON format
  if (isJsonFormat(trimmed)) {
    const cookies = parseJsonFormat(trimmed);
    if (cookies.length > 0) {
      return { cookies, format: 'json' };
    }
  }

  // Try plain cookie string
  if (isCookieString(trimmed)) {
    return { cookies: parseCookieString(trimmed), format: 'string' };
  }

  // Fallback: treat as Edge format even if header detection was weak
  const fallback = parseEdgeDevToolsFormat(trimmed);
  if (fallback.length > 0) {
    return { cookies: fallback, format: 'edge-fallback' };
  }

  return { cookies: [], format: 'unknown' };
}

export function filterJjwxcCookies(cookies: ParsedCookie[]): ParsedCookie[] {
  return cookies.filter((c) => {
    const domain = (c.domain || '').toLowerCase();
    return domain.includes('jjwxc.net') || domain.includes('jjwxc');
  });
}

export function cookiesToString(cookies: ParsedCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export function autoConvertCookieInput(text: string): { cookieString: string; format: string; total: number; jjwxcCount: number } {
  const { cookies, format } = autoParseCookies(text);
  const jjwxcCookies = filterJjwxcCookies(cookies);
  return {
    cookieString: cookiesToString(jjwxcCookies),
    format,
    total: cookies.length,
    jjwxcCount: jjwxcCookies.length,
  };
}
