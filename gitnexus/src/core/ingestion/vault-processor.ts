import matter from 'gray-matter';

export interface ParsedFrontmatter {
  ok: boolean;
  fm: Record<string, unknown>;
  body: string;
  raw?: string; // populated when ok=false
}

/**
 * Parse YAML frontmatter from a markdown file. Returns ok=false on parse error,
 * preserving the raw text for diagnostic storage.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  try {
    const parsed = matter(text);
    return {
      ok: true,
      fm: parsed.data as Record<string, unknown>,
      body: parsed.content,
    };
  } catch (err) {
    // Extract the raw frontmatter block (between --- markers) for diagnostics
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return {
      ok: false,
      fm: {},
      body: text,
      raw: match ? match[1] : text.slice(0, 500),
    };
  }
}

export interface WikiLinkRef {
  target: string;
  alias: string | undefined;
  anchor: string | undefined;
}

const WIKILINK_RE = /(!?)\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/**
 * Extract every [[Note]], [[Note|alias]], [[Note#heading]], and ![[Note]]
 * from a markdown body. Returns refs in document order. Embeds (![[]]) are
 * treated identically to wikilinks for graph purposes.
 */
export function extractWikilinks(body: string): WikiLinkRef[] {
  const out: WikiLinkRef[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    const [, , target, anchor, alias] = m;
    out.push({
      target: target.trim(),
      alias: alias?.trim(),
      anchor: anchor?.trim(),
    });
  }
  return out;
}
