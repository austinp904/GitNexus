import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractWikilinks,
  resolveWikilink,
} from '../../src/core/ingestion/vault-processor.js';

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

describe('extractWikilinks', () => {
  it('extracts simple [[Note]] form', () => {
    const refs = extractWikilinks('See [[Note Title]] for details.');
    expect(refs).toEqual([{ target: 'Note Title', alias: undefined, anchor: undefined }]);
  });

  it('extracts [[Note|alias]] form', () => {
    const refs = extractWikilinks('See [[03-People/Alice Smith|Alice]] in the team.');
    expect(refs).toEqual([{ target: '03-People/Alice Smith', alias: 'Alice', anchor: undefined }]);
  });

  it('extracts heading anchors [[Note#heading]]', () => {
    const refs = extractWikilinks('See [[Note#section-1]].');
    expect(refs).toEqual([{ target: 'Note', alias: undefined, anchor: 'section-1' }]);
  });

  it('extracts embeds ![[Note]] same as [[Note]]', () => {
    const refs = extractWikilinks('Embed: ![[Note]]');
    expect(refs).toEqual([{ target: 'Note', alias: undefined, anchor: undefined }]);
  });

  it('handles multiple wikilinks in one body', () => {
    const refs = extractWikilinks('A [[X]] and B [[Y|alias]] and C [[Z#h]].');
    expect(refs.length).toBe(3);
    expect(refs[0].target).toBe('X');
    expect(refs[1].target).toBe('Y');
    expect(refs[1].alias).toBe('alias');
    expect(refs[2].target).toBe('Z');
    expect(refs[2].anchor).toBe('h');
  });

  it('returns empty array for body with no wikilinks', () => {
    const refs = extractWikilinks('Just plain text.');
    expect(refs).toEqual([]);
  });
});

describe('resolveWikilink', () => {
  const nameIndex = new Map<string, string>([
    ['Alice Smith', 'Person:alice'],
    ['03-People/Alice Smith', 'Person:alice'],
    ['Alpha', 'Project:alpha'],
    ['04-Projects/Alpha', 'Project:alpha'],
    ['Pricing', 'Topic:pricing'],
    ['05-Topics/Pricing', 'Topic:pricing'],
  ]);

  it('resolves direct path match', () => {
    const id = resolveWikilink(
      { target: '03-People/Alice Smith', alias: undefined, anchor: undefined },
      nameIndex,
    );
    expect(id).toBe('Person:alice');
  });

  it('falls back to basename match', () => {
    const id = resolveWikilink(
      { target: 'Alice Smith', alias: undefined, anchor: undefined },
      nameIndex,
    );
    expect(id).toBe('Person:alice');
  });

  it('returns null for unknown targets', () => {
    const id = resolveWikilink(
      { target: 'Nonexistent', alias: undefined, anchor: undefined },
      nameIndex,
    );
    expect(id).toBeNull();
  });

  it('ignores anchor for resolution (resolves to file)', () => {
    const id = resolveWikilink(
      { target: 'Alpha', alias: undefined, anchor: 'section-1' },
      nameIndex,
    );
    expect(id).toBe('Project:alpha');
  });
});
