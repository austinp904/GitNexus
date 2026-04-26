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
