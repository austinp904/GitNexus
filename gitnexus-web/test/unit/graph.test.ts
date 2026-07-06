import { describe, expect, it } from 'vitest';
import type { GraphNode, GraphRelationship } from 'gitnexus-shared';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import {
  computeCategoryHiddenNodeIds,
  computeScopeHiddenNodeIds,
} from '../../src/lib/graph-adapter';
import { getGraphScopePreset, isPathInScopePreset } from '../../src/lib/scope-presets';
import {
  createFileNode,
  createFunctionNode,
  createCallsRelationship,
  createContainsRelationship,
} from '../fixtures/graph';

describe('createKnowledgeGraph', () => {
  it('starts empty', () => {
    const graph = createKnowledgeGraph();
    expect(graph.nodeCount).toBe(0);
    expect(graph.relationshipCount).toBe(0);
    expect(graph.nodes).toEqual([]);
    expect(graph.relationships).toEqual([]);
  });

  it('adds nodes', () => {
    const graph = createKnowledgeGraph();
    const node = createFileNode('index.ts', 'src/index.ts');
    graph.addNode(node);

    expect(graph.nodeCount).toBe(1);
    expect(graph.nodes[0].id).toBe('File:src/index.ts');
  });

  it('deduplicates nodes by id', () => {
    const graph = createKnowledgeGraph();
    const node = createFileNode('index.ts', 'src/index.ts');
    const duplicateNode = createFileNode('index.ts', 'src/index.ts');
    graph.addNode(node);
    graph.addNode(duplicateNode);

    expect(graph.nodeCount).toBe(1);
  });

  it('adds relationships', () => {
    const graph = createKnowledgeGraph();
    const rel = createCallsRelationship('fn:a', 'fn:b');
    graph.addRelationship(rel);

    expect(graph.relationshipCount).toBe(1);
    expect(graph.relationships[0].type).toBe('CALLS');
  });

  it('deduplicates relationships by id', () => {
    const graph = createKnowledgeGraph();
    const rel = createCallsRelationship('fn:a', 'fn:b');
    const duplicateRel = createCallsRelationship('fn:a', 'fn:b');
    graph.addRelationship(rel);
    graph.addRelationship(duplicateRel);

    expect(graph.relationshipCount).toBe(1);
  });

  it('builds a multi-node graph', () => {
    const graph = createKnowledgeGraph();
    const file = createFileNode('app.ts', 'src/app.ts');
    const fn1 = createFunctionNode('main', 'src/app.ts', 1);
    const fn2 = createFunctionNode('helper', 'src/app.ts', 20);

    graph.addNode(file);
    graph.addNode(fn1);
    graph.addNode(fn2);
    graph.addRelationship(createContainsRelationship(file.id, fn1.id));
    graph.addRelationship(createContainsRelationship(file.id, fn2.id));
    graph.addRelationship(createCallsRelationship(fn1.id, fn2.id));

    expect(graph.nodeCount).toBe(3);
    expect(graph.relationshipCount).toBe(3);
  });
});

describe('computeCategoryHiddenNodeIds', () => {
  it('hides members of code communities by heuristic label', () => {
    const graph = createKnowledgeGraph();
    const file = createFileNode('planner.ts', 'src/planner.ts');
    const fn = createFunctionNode('solvePlannerState', 'src/planner.ts', 10);
    const community: GraphNode = {
      id: 'comm_1',
      label: 'Community',
      properties: {
        name: 'Cluster 1',
        filePath: '',
        heuristicLabel: 'Planner',
        symbolCount: 2,
      },
    };
    const membership: GraphRelationship = {
      id: 'Function:planner_MEMBER_OF_comm_1',
      sourceId: fn.id,
      targetId: community.id,
      type: 'MEMBER_OF',
      confidence: 1,
      reason: 'cluster-membership',
    };

    graph.addNode(file);
    graph.addNode(fn);
    graph.addNode(community);
    graph.addRelationship(membership);

    const hidden = computeCategoryHiddenNodeIds(graph, new Set(), new Set(), new Set(['Planner']));

    expect(hidden.has(fn.id)).toBe(true);
    expect(hidden.has(community.id)).toBe(true);
    expect(hidden.has(file.id)).toBe(false);
  });
});

describe('scope presets', () => {
  it('matches runtime app paths while excluding tests and fixtures', () => {
    const runtime = getGraphScopePreset('runtime-app');

    expect(isPathInScopePreset('app/src/features/planner/Planner.tsx', runtime)).toBe(true);
    expect(isPathInScopePreset('app/server/roofSkeleton.ts', runtime)).toBe(true);
    expect(
      isPathInScopePreset('app/src/features/planner/__tests__/Planner.test.tsx', runtime),
    ).toBe(false);
    expect(
      isPathInScopePreset('app/src/lib/framing/__fixtures__/golden/F2.golden.json', runtime),
    ).toBe(false);
    expect(isPathInScopePreset('notes/research/fl-permit-packet-requirements.md', runtime)).toBe(
      false,
    );
  });

  it('computes hidden graph nodes outside an active scope preset', () => {
    const graph = createKnowledgeGraph();
    const planner = createFileNode('Planner.tsx', 'app/src/features/planner/Planner.tsx');
    const solverFixture = createFileNode(
      'F2.golden.json',
      'app/src/lib/framing/__fixtures__/golden/F2.golden.json',
    );
    const permitNote = createFileNode(
      'fl-permit-packet-requirements.md',
      'notes/research/fl-permit-packet-requirements.md',
    );

    graph.addNode(planner);
    graph.addNode(solverFixture);
    graph.addNode(permitNote);

    const hidden = computeScopeHiddenNodeIds(graph, getGraphScopePreset('runtime-app'));

    expect(hidden.has(planner.id)).toBe(false);
    expect(hidden.has(solverFixture.id)).toBe(true);
    expect(hidden.has(permitNote.id)).toBe(true);
  });
});
