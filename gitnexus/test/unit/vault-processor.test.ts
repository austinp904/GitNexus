import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractWikilinks,
  resolveWikilink,
  processVaultFile,
  resolveAllWikilinks,
  type VaultProcessStats,
} from '../../src/core/ingestion/vault-processor.js';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';

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

function emptyStats(): VaultProcessStats {
  return {
    processed: 0,
    notes: 0,
    people: 0,
    projects: 0,
    topics: 0,
    tags: 0,
    links: 0,
    unresolved: 0,
  };
}

describe('processVaultFile', () => {
  it('emits Note + Person + Project + Topic + Tag nodes from frontmatter', () => {
    const graph = createKnowledgeGraph();
    const text = `---
participants: [Alice Smith, Bob Jones]
projects: [Alpha]
topics: [Pricing]
tags: [urgent, project/alpha, topic/pricing]
started: 2026-01-15
message_count: 3
---
# A thread`;

    const stats = emptyStats();
    processVaultFile(graph, '/repo', '01-Threads/test.md', text, stats);

    expect(stats.notes).toBe(1);
    expect(stats.people).toBe(2);
    expect(stats.projects).toBe(1);
    expect(stats.topics).toBe(1);
    expect(stats.tags).toBe(1); // 'urgent' only; project/* and topic/* stripped
    // 1 Note, 2 Persons, 1 Project (Alpha), 1 Topic (Pricing), 1 Tag (urgent)
    expect(graph.nodeCount).toBeGreaterThanOrEqual(6);
  });

  it('strips auto-generated project/* and topic/* tags', () => {
    const graph = createKnowledgeGraph();
    const text = `---
tags: [thread, project/alpha, topic/pricing, urgent]
---
# Thread`;
    const stats = emptyStats();
    processVaultFile(graph, '/repo', '01-Threads/x.md', text, stats);

    const tagNodes = graph.nodes.filter((n) => n.label === 'Tag');
    const tagNames = tagNodes.map((n) => n.properties.name).sort();
    expect(tagNames).toEqual(['thread', 'urgent']);
  });

  it('does not crash on malformed YAML; still creates Note', () => {
    const graph = createKnowledgeGraph();
    const text = `---
projects: [Alpha
broken
---
# Body`;
    const stats = emptyStats();
    processVaultFile(graph, '/repo', '01-Threads/bad.md', text, stats);

    expect(stats.notes).toBe(1);
    const noteNode = graph.nodes.find((n) => n.label === 'Note');
    expect(noteNode?.properties.frontmatterRaw).toContain('broken');
    expect(noteNode?.properties.frontmatterJson).toBeUndefined();
  });
});

describe('resolveAllWikilinks', () => {
  it('emits LINKS_TO edges for resolved wikilinks and counts unresolved', () => {
    const graph = createKnowledgeGraph();
    const stats: VaultProcessStats = emptyStats();

    // Pass 1: build the index
    const note1 = processVaultFile(
      graph,
      '/repo',
      '01-Threads/a.md',
      `---\nparticipants: [Alice]\n---\n# A`,
      stats,
    );
    const note2 = processVaultFile(
      graph,
      '/repo',
      '01-Threads/b.md',
      `---\nparticipants: [Alice]\n---\n# B\nSee [[01-Threads/a]] and [[Nonexistent]].`,
      stats,
    );

    const nameIndex = new Map<string, string>();
    for (const n of graph.nodes) {
      nameIndex.set(String(n.properties.name), n.id);
      const filePath = n.properties.filePath;
      if (typeof filePath === 'string' && filePath !== '') {
        nameIndex.set(filePath.replace(/\.md$/, ''), n.id);
      }
    }

    // Pass 2: resolve wikilinks for each file
    const fileBodies = new Map([
      ['01-Threads/a.md', '# A'],
      ['01-Threads/b.md', '# B\nSee [[01-Threads/a]] and [[Nonexistent]].'],
    ]);
    const fileNotes = new Map<string, string>();
    if (note1) fileNotes.set('01-Threads/a.md', note1);
    if (note2) fileNotes.set('01-Threads/b.md', note2);

    resolveAllWikilinks(graph, fileBodies, fileNotes, nameIndex, stats);

    expect(stats.links).toBe(1); // [[01-Threads/a]] resolved
    expect(stats.unresolved).toBe(1); // [[Nonexistent]]
  });
});
