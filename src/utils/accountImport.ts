/** 只识别明确的 Refresh Token；返回去重后的值，不在错误信息中回显凭据。 */
export function extractRefreshTokens(input: string): { tokens: string[]; duplicates: number; invalid: number } {
  const text = input.trim();
  if (!text) return { tokens: [], duplicates: 0, invalid: 0 };

  let rawTokens: string[];
  if (text.startsWith('[') || text.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('invalid_json');
    }
    const entries = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && 'accounts' in parsed
        ? (parsed as { accounts: unknown }).accounts
        : [parsed];
    if (!Array.isArray(entries)) throw new Error('invalid_json');
    rawTokens = entries.map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (typeof entry !== 'object' || entry === null) return '';
      const value = (entry as { refresh_token?: unknown; token?: { refresh_token?: unknown } }).refresh_token
        ?? (entry as { token?: { refresh_token?: unknown } }).token?.refresh_token;
      return typeof value === 'string' ? value.trim() : '';
    });
  } else {
    rawTokens = text.split(/[\s,;]+/).map((token) => token.trim()).filter(Boolean);
  }

  const valid = rawTokens.filter((token) => /^1\/\/[A-Za-z0-9_-]+$/.test(token));
  const tokens = [...new Set(valid)];
  return { tokens, duplicates: valid.length - tokens.length, invalid: rawTokens.length - valid.length };
}
