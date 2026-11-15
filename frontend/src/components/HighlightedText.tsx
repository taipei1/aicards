import type { CSSProperties, ReactNode } from 'react';

interface Range {
  start: number;
  end: number;
}

interface Props {
  text: string;
  /** Exact substrings returned by the model; may be several for separable verbs. */
  spans?: string[];
  style?: CSSProperties;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && WORD_CHAR.test(char));
}

/** Find `needle` only where it is not part of a larger word. */
function findWholeWord(haystack: string, needle: string, from: number): number {
  let index = haystack.indexOf(needle, from);
  while (index >= 0) {
    const before = index > 0 ? haystack[index - 1] : undefined;
    const after = haystack[index + needle.length];
    const startOk = !isWordChar(needle[0]) || !isWordChar(before);
    const endOk = !isWordChar(needle[needle.length - 1]) || !isWordChar(after);
    if (startOk && endOk) return index;
    index = haystack.indexOf(needle, index + 1);
  }
  return -1;
}

function locate(text: string, spans: string[]): Range[] {
  if (!text || spans.length === 0) return [];
  const lower = text.toLocaleLowerCase();
  const ranges: Range[] = [];

  // Longest first: a multi-word span must win over a shorter word inside it.
  const sorted = [...spans]
    .map((span) => span.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const span of sorted) {
    const needle = span.toLocaleLowerCase();
    if (!needle) continue;

    // Prefer whole-word occurrences: in "start your art project" the card
    // word "art" must highlight the standalone word, not the middle of
    // "start". If the model's span is punctuation-wrapped, fall back to a
    // plain search so the text is never silently unhighlighted.
    const wholeWord = findWholeWord(lower, needle, 0) >= 0;
    let from = 0;
    while (from <= lower.length - needle.length) {
      const index = wholeWord
        ? findWholeWord(lower, needle, from)
        : lower.indexOf(needle, from);
      if (index < 0) break;
      const candidate = { start: index, end: index + needle.length };
      const overlaps = ranges.some(
        (r) => candidate.start < r.end && candidate.end > r.start
      );
      if (!overlaps) ranges.push(candidate);
      from = index + Math.max(1, needle.length);
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Renders plain text with the card word (or its inflected form) highlighted.
 *
 * The backend stores exact substrings, so this is a literal, case-insensitive
 * search — no model HTML, no global regex, no mutation of the text. If a span
 * does not match, the text is shown unchanged.
 */
export function HighlightedText({ text, spans = [], style }: Props) {
  const ranges = locate(text, spans);
  if (ranges.length === 0) {
    return <span style={style}>{text}</span>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(<span key={`t-${index}`}>{text.slice(cursor, range.start)}</span>);
    }
    parts.push(
      <mark key={`m-${index}`} className="phrase-highlight">
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span style={style}>{parts}</span>;
}
