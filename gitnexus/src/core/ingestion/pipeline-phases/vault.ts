/**
 * Phase: vault
 *
 * Two-pass Obsidian-style vault ingestion.
 *
 * Pass 1: For every .md / .mdx file, parse YAML frontmatter and emit
 *         Note + Person/Project/Topic/Tag nodes plus their frontmatter-driven
 *         edges (PARTICIPATES_IN, MEMBER_OF, TAGGED, LABELED).
 *
 * Pass 2: Build a global name index across every node emitted so far, then
 *         re-walk each file body to extract `[[wikilinks]]` and emit LINKS_TO
 *         edges. The split is required because a wikilink can reference a Note
 *         that hasn't been created yet during forward iteration.
 *
 * @deps    structure
 * @reads   scannedFiles, allPathSet (from structure phase) — for path filter
 * @writes  graph (Note/Person/Project/Topic/Tag nodes + frontmatter edges + LINKS_TO edges)
 */
import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import { readFileContents } from '../filesystem-walker.js';
import {
  processVaultFile,
  resolveAllWikilinks,
  type VaultProcessStats,
} from '../vault-processor.js';
import type { StructureOutput } from './structure.js';
import { isDev } from '../utils/env.js';

export interface VaultOutput {
  /** True when no markdown files were found (phase short-circuited). */
  skipped: boolean;
  /** Per-pass node/edge counts emitted by the vault processor. */
  stats: VaultProcessStats;
}

const emptyStats = (): VaultProcessStats => ({
  processed: 0,
  notes: 0,
  people: 0,
  projects: 0,
  topics: 0,
  tags: 0,
  links: 0,
  unresolved: 0,
});

export const vaultPhase: PipelinePhase<VaultOutput> = {
  name: 'vault',
  deps: ['structure'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<VaultOutput> {
    const { scannedFiles } = getPhaseOutput<StructureOutput>(deps, 'structure');

    const mdScanned = scannedFiles.filter((f) => f.path.endsWith('.md') || f.path.endsWith('.mdx'));

    if (mdScanned.length === 0) {
      return { skipped: true, stats: emptyStats() };
    }

    const stats = emptyStats();

    // Read every markdown file once; we need the full text both for pass 1
    // (frontmatter parsing inside processVaultFile) and pass 2 (wikilink body
    // walk inside resolveAllWikilinks).
    const mdContents = await readFileContents(
      ctx.repoPath,
      mdScanned.map((f) => f.path),
    );

    // ── Pass 1: emit nodes from frontmatter, capture body+id per file ──────
    const fileBodies = new Map<string, string>();
    const fileNoteIds = new Map<string, string>();
    for (const { path: relPath } of mdScanned) {
      const text = mdContents.get(relPath);
      if (text === undefined) continue; // read failed in walker; skip silently
      try {
        const noteId = processVaultFile(ctx.graph, ctx.repoPath, relPath, text, stats);
        if (noteId) {
          fileNoteIds.set(relPath, noteId);
          fileBodies.set(relPath, text);
        }
      } catch (err) {
        // Per-file isolation: a single bad file must not crash the whole phase.
        console.warn(
          `vault: failed to process ${relPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── Build nameIndex for cross-file wikilink resolution ────────────────
    // Index by node `name` first (Wikilink targets are typically display names),
    // then also index by `filePath` minus the .md extension as a fallback for
    // path-form links like [[01-Threads/Some Note]].
    const nameIndex = new Map<string, string>();
    for (const n of ctx.graph.nodes) {
      const name = n.properties.name;
      if (typeof name === 'string' && !nameIndex.has(name)) {
        nameIndex.set(name, n.id);
      }
      const filePath = (n.properties as Record<string, unknown>).filePath;
      if (typeof filePath === 'string' && filePath.length > 0) {
        const key = filePath.replace(/\.md$/, '');
        if (!nameIndex.has(key)) nameIndex.set(key, n.id);
      }
    }

    // ── Pass 2: resolve wikilinks → emit LINKS_TO edges ───────────────────
    resolveAllWikilinks(ctx.graph, fileBodies, fileNoteIds, nameIndex, stats);

    if (isDev) {
      console.log(
        `  Vault: ${stats.notes} notes, ${stats.people} people, ${stats.projects} projects, ` +
          `${stats.topics} topics, ${stats.tags} tags, ${stats.links} links ` +
          `(${stats.unresolved} unresolved) from ${mdScanned.length} files`,
      );
    }

    return { skipped: false, stats };
  },
};
