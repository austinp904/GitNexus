/**
 * Phase: vaultCommunities
 *
 * Detects communities in the vault (Note + LINKS_TO) subgraph using the
 * Leiden algorithm and emits Community nodes + MEMBER_OF edges. This is
 * the vault-mode counterpart to the `communities` phase: that one runs
 * Leiden on CALLS/EXTENDS/IMPLEMENTS edges between code symbols, this one
 * runs it on wikilinks between Notes. Together they let the visualizer
 * color clusters distinctly in either mode.
 *
 * Community IDs are namespaced (`Community:vault-N`) so they cannot collide
 * with the code-mode `comm_N` IDs even when both phases run on the same
 * graph (e.g. a hybrid repo with both Markdown and source files).
 *
 * @deps    vault
 * @reads   ctx.graph (Note nodes, LINKS_TO edges)
 * @writes  ctx.graph (Community nodes with kind: 'vault', MEMBER_OF edges)
 */
import Graph from 'graphology';
import type { AbstractGraph, Attributes } from 'graphology-types';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import type { VaultOutput } from './vault.js';
import { generateId } from '../../../lib/utils.js';
import { isDev } from '../utils/env.js';

// Vendored Leiden — same path/loader pattern as community-processor.ts.
// The algorithm was never published to npm so we ship the graphology source
// in vendor/leiden and load it via createRequire to bridge ESM ↔ CJS.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const leidenPath = resolve(__dirname, '..', '..', '..', '..', 'vendor', 'leiden', 'index.cjs');
const _require = createRequire(import.meta.url);

type GraphInstance = AbstractGraph<Attributes, Attributes, Attributes>;

interface LeidenModule {
  detailed: (graph: GraphInstance, options: Record<string, unknown>) => LeidenDetailedResult;
}

interface LeidenDetailedResult {
  communities: Record<string, number>;
  count: number;
  modularity: number;
}

const leiden: LeidenModule = _require(leidenPath);

export interface VaultCommunitiesOutput {
  /** True when vault was skipped or there were no Note nodes / LINKS_TO edges. */
  skipped: boolean;
  /** Number of non-singleton communities emitted as Community nodes. */
  communities: number;
  /** Modularity score from Leiden (0 when skipped). */
  modularity: number;
}

export const vaultCommunitiesPhase: PipelinePhase<VaultCommunitiesOutput> = {
  name: 'vaultCommunities',
  deps: ['vault'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<VaultCommunitiesOutput> {
    const vaultOut = getPhaseOutput<VaultOutput>(deps, 'vault');
    if (vaultOut.skipped) {
      return { skipped: true, communities: 0, modularity: 0 };
    }

    // Build a graphology subgraph: Note nodes only, LINKS_TO edges only.
    // Cast through `unknown` for the same CJS/ESM interop reason as
    // community-processor.ts (graphology's default export shape differs
    // between TS namespace import and CJS require resolution).
    const GraphCtor = Graph as unknown as new (options: {
      type: string;
      allowSelfLoops: boolean;
    }) => GraphInstance;
    const g = new GraphCtor({ type: 'undirected', allowSelfLoops: false });

    const noteIds = new Set<string>();
    for (const n of ctx.graph.nodes) {
      if (n.label === 'Note') {
        noteIds.add(n.id);
        g.addNode(n.id);
      }
    }

    for (const r of ctx.graph.relationships) {
      if (r.type !== 'LINKS_TO') continue;
      if (r.sourceId === r.targetId) continue;
      if (!noteIds.has(r.sourceId) || !noteIds.has(r.targetId)) continue;
      // De-dupe parallel wikilinks (multiple [[X]] from same source to same target).
      if (g.hasEdge(r.sourceId, r.targetId)) continue;
      g.addEdge(r.sourceId, r.targetId);
    }

    if (g.order === 0 || g.size === 0) {
      return { skipped: true, communities: 0, modularity: 0 };
    }

    // Resolution 1.0 is the standard Leiden default and matches what the
    // existing communities phase uses for non-large graphs. Vault wikilink
    // graphs are typically <10K notes so we don't need the large-graph
    // tuning (higher resolution + capped iterations) from community-processor.
    const result = leiden.detailed(g, { resolution: 1.0 });

    // Group node IDs by community.
    const byCommunity = new Map<number, string[]>();
    for (const [nodeId, commNum] of Object.entries(result.communities)) {
      const arr = byCommunity.get(commNum);
      if (arr) {
        arr.push(nodeId);
      } else {
        byCommunity.set(commNum, [nodeId]);
      }
    }

    // Emit Community nodes + MEMBER_OF edges. Skip singletons — they're
    // just isolated notes, not meaningful clusters.
    let count = 0;
    for (const [commNum, members] of byCommunity) {
      if (members.length < 2) continue;
      const id = generateId('Community', `vault-${commNum}`);
      ctx.graph.addNode({
        id,
        label: 'Community',
        properties: {
          name: `Vault Community ${commNum}`,
          filePath: '',
          kind: 'vault',
          symbolCount: members.length,
        },
      });
      for (const memberId of members) {
        ctx.graph.addRelationship({
          id: generateId('MEMBER_OF', `${memberId}->${id}`),
          type: 'MEMBER_OF',
          sourceId: memberId,
          targetId: id,
          confidence: 1.0,
          reason: 'leiden-vault',
        });
      }
      count++;
    }

    if (isDev) {
      console.log(
        `  Vault communities: ${count} clusters from ${g.order} notes / ${g.size} links ` +
          `(modularity: ${result.modularity.toFixed(3)})`,
      );
    }

    return { skipped: false, communities: count, modularity: result.modularity };
  },
};
