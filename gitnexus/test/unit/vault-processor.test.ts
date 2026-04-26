import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/core/ingestion/vault-processor.js';

describe('parseFrontmatter', () => {
  it('parses a well-formed YAML block', () => {
    const text = `---
participants:
  - Alice
  - Bob
projects:
  - Alpha
---
body text here`;
    const { fm, body, ok } = parseFrontmatter(text);
    expect(ok).toBe(true);
    expect(fm.participants).toEqual(['Alice', 'Bob']);
    expect(fm.projects).toEqual(['Alpha']);
    expect(body.trim()).toBe('body text here');
  });

  it('returns ok=false on malformed YAML', () => {
    const text = `---
participants: [Alice
broken: : :
---
body`;
    const { ok, raw } = parseFrontmatter(text);
    expect(ok).toBe(false);
    expect(raw).toContain('broken: : :');
  });

  it('handles files with no frontmatter', () => {
    const text = `# just markdown\nno frontmatter here`;
    const { fm, body, ok } = parseFrontmatter(text);
    expect(ok).toBe(true);
    expect(fm).toEqual({});
    expect(body).toBe(text);
  });
});
