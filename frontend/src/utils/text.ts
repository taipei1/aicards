/**
 * Keep one space between words, remove leading spaces, and collapse runs of
 * spaces/tabs/newlines. A single trailing space survives while typing, so
 * "dobrý deň" can be entered normally; the final value is trimmed on save.
 */
export function normalizeSpaces(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^ /, '');
}

/** Final form for DB/API calls: no leading/trailing whitespace at all. */
export function trimSpaces(value: string): string {
  return normalizeSpaces(value).trim();
}
