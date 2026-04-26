import matter from 'gray-matter';
import type { KnowledgeGraph } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

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

/**
 * Resolve a wikilink target to a node ID by looking it up in the name index.
 * First tries the full target as a key; falls back to the basename (last path segment).
 * Returns null if no match — caller decides whether to log/skip/error.
 *
 * Anchors are ignored at this layer — heading-level resolution is out of scope for MVP.
 */
export function resolveWikilink(ref: WikiLinkRef, nameIndex: Map<string, string>): string | null {
  const direct = nameIndex.get(ref.target);
  if (direct) return direct;
  const basename = ref.target.split('/').pop() ?? ref.target;
  return nameIndex.get(basename) ?? null;
}

export interface VaultProcessStats {
  processed: number;
  notes: number;
  people: number;
  projects: number;
  topics: number;
  tags: number;
  links: number;
  unresolved: number;
}

/**
 * Process a single .md file: parse frontmatter, emit nodes (Note, Person, Project, Topic, Tag),
 * emit frontmatter-driven edges (PARTICIPATES_IN, MEMBER_OF, TAGGED, LABELED).
 *
 * Wikilink (LINKS_TO) edges are NOT emitted here — they require the global nameIndex
 * which is populated across all files. Caller does that in a second pass.
 *
 * Returns the noteId so the caller can build the nameIndex for cross-file resolution.
 */
export function processVaultFile(
  graph: KnowledgeGraph,
  _repoPath: string,
  relPath: string,
  text: string,
  stats: VaultProcessStats,
): string | null {
  const { fm, ok, raw } = parseFrontmatter(text);

  // 1. Create the Note node
  const baseName = relPath.split('/').pop()?.replace(/\.md$/, '') ?? relPath;
  const noteId = generateId('Note', relPath);
  const noteProps: Record<string, unknown> = {
    name: baseName,
    filePath: relPath,
    title: typeof fm.title === 'string' ? fm.title : baseName,
  };
  if (ok) {
    noteProps.frontmatterJson = JSON.stringify(fm);
    if (typeof fm.started === 'string') noteProps.started = fm.started;
    if (typeof fm.ended === 'string') noteProps.ended = fm.ended;
    if (typeof fm.duration_days === 'number') noteProps.durationDays = fm.duration_days;
    if (typeof fm.message_count === 'number') noteProps.messageCount = fm.message_count;
    if (typeof fm.outcome === 'string') noteProps.outcome = fm.outcome;
    if (typeof fm.has_attachments === 'boolean') noteProps.hasAttachments = fm.has_attachments;
  } else if (raw !== undefined) {
    noteProps.frontmatterRaw = raw;
  }
  graph.addNode({
    id: noteId,
    label: 'Note',
    properties: noteProps as { name: string; filePath: string },
  });
  stats.notes++;

  // 2. Helper to upsert a child node and emit an edge.
  // Cross-file aggregate nodes (Person/Project/Topic/Tag) deliberately omit
  // `filePath` so the graph's per-file index doesn't pollute when an aggregate
  // is referenced from many notes.
  const upsertAndEdge = (
    label: 'Person' | 'Project' | 'Topic' | 'Tag',
    name: string,
    edgeType: 'PARTICIPATES_IN' | 'MEMBER_OF' | 'TAGGED' | 'LABELED',
    edgeReason: string,
    direction: 'from-note' | 'to-note',
  ) => {
    const id = generateId(label, name);
    if (graph.getNode(id) === undefined) {
      graph.addNode({
        id,
        label,
        properties: { name, filePath: '' },
      });
      if (label === 'Person') stats.people++;
      else if (label === 'Project') stats.projects++;
      else if (label === 'Topic') stats.topics++;
      else if (label === 'Tag') stats.tags++;
    }
    const [src, tgt] = direction === 'from-note' ? [noteId, id] : [id, noteId];
    graph.addRelationship({
      id: generateId(edgeType, `${src}->${tgt}`),
      type: edgeType,
      sourceId: src,
      targetId: tgt,
      confidence: 1.0,
      reason: edgeReason,
    });
  };

  // 3. Emit frontmatter-driven nodes and edges
  if (ok) {
    const participants = Array.isArray(fm.participants) ? (fm.participants as unknown[]) : [];
    for (const p of participants) {
      if (typeof p === 'string')
        upsertAndEdge('Person', p, 'PARTICIPATES_IN', 'frontmatter-participants', 'to-note');
    }
    const projects = Array.isArray(fm.projects) ? (fm.projects as unknown[]) : [];
    for (const proj of projects) {
      if (typeof proj === 'string')
        upsertAndEdge('Project', proj, 'MEMBER_OF', 'frontmatter-projects', 'from-note');
    }
    const topics = Array.isArray(fm.topics) ? (fm.topics as unknown[]) : [];
    for (const t of topics) {
      if (typeof t === 'string')
        upsertAndEdge('Topic', t, 'TAGGED', 'frontmatter-topics', 'from-note');
    }
    // Tags: skip auto-generated project/* and topic/* prefixes (they duplicate the dedicated arrays)
    const tags = Array.isArray(fm.tags) ? (fm.tags as unknown[]) : [];
    for (const t of tags) {
      if (typeof t === 'string' && !/^(project|topic)\//.test(t)) {
        upsertAndEdge('Tag', t, 'LABELED', 'frontmatter-tags', 'from-note');
      }
    }
  }

  stats.processed++;
  return noteId;
}
