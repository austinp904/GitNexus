import Graph from 'graphology';
import type { NodeLabel } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../core/graph/types';
import { NODE_COLORS, NODE_SIZES, getCommunityColor } from './constants';
import { ALL_SCOPE_PRESET_ID, isPathInScopePreset, type GraphScopePreset } from './scope-presets';

const categoryNameForNode = (node: {
  label: NodeLabel;
  properties?: { name?: string; heuristicLabel?: string };
}): string => {
  if (node.label === 'Community') {
    return String(node.properties?.heuristicLabel ?? node.properties?.name ?? '');
  }
  return String(node.properties?.name ?? '');
};

/**
 * Compute the set of node IDs that should be hidden because they are members
 * of a hidden Project/Community (via MEMBER_OF) or tagged with a hidden Topic
 * (via TAGGED).
 *
 * Walks the source KnowledgeGraph relationships rather than the graphology
 * graph because edge attributes (specifically the `type` discriminator) are
 * preserved more reliably on the source side, and category membership
 * lookups need both the relation type and the target node label.
 */
export const computeCategoryHiddenNodeIds = (
  knowledgeGraph: KnowledgeGraph,
  hiddenProjects: Set<string>,
  hiddenTopics: Set<string>,
  hiddenCommunities: Set<string> = new Set(),
): Set<string> => {
  const hidden = new Set<string>();
  if (hiddenProjects.size === 0 && hiddenTopics.size === 0 && hiddenCommunities.size === 0) {
    return hidden;
  }

  // Map nodeId -> { label, name } so we can resolve relationship targets fast.
  const nodeMeta = new Map<string, { label: NodeLabel; name: string }>();
  for (const n of knowledgeGraph.nodes) {
    nodeMeta.set(n.id, {
      label: n.label,
      name: categoryNameForNode(n),
    });
  }

  for (const rel of knowledgeGraph.relationships) {
    const target = nodeMeta.get(rel.targetId);
    if (!target) continue;

    if (rel.type === 'MEMBER_OF' && target.label === 'Project') {
      if (hiddenProjects.has(target.name)) {
        hidden.add(rel.sourceId);
        // Also hide the Project node itself when it's filtered out
        hidden.add(rel.targetId);
      }
    } else if (rel.type === 'MEMBER_OF' && target.label === 'Community') {
      if (hiddenCommunities.has(target.name)) {
        hidden.add(rel.sourceId);
        hidden.add(rel.targetId);
      }
    } else if (rel.type === 'TAGGED' && target.label === 'Topic') {
      if (hiddenTopics.has(target.name)) {
        hidden.add(rel.sourceId);
        hidden.add(rel.targetId);
      }
    }
  }

  return hidden;
};

export const computeScopeHiddenNodeIds = (
  knowledgeGraph: KnowledgeGraph,
  scopePreset: GraphScopePreset,
): Set<string> => {
  const hidden = new Set<string>();
  if (scopePreset.id === ALL_SCOPE_PRESET_ID) return hidden;

  for (const node of knowledgeGraph.nodes) {
    if (!isPathInScopePreset(node.properties.filePath, scopePreset)) {
      hidden.add(node.id);
    }
  }

  return hidden;
};

export const mergeHiddenNodeIds = (
  ...hiddenNodeIdSets: Array<Set<string> | undefined>
): Set<string> | undefined => {
  const merged = new Set<string>();
  for (const ids of hiddenNodeIdSets) {
    if (!ids) continue;
    for (const id of ids) merged.add(id);
  }
  return merged.size > 0 ? merged : undefined;
};

export interface SigmaNodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  nodeType: NodeLabel;
  filePath: string;
  startLine?: number;
  endLine?: number;
  hidden?: boolean;
  zIndex?: number;
  highlighted?: boolean;
  mass?: number; // ForceAtlas2 mass - higher = more repulsion
  community?: number; // Community index from Leiden algorithm
  communityColor?: string; // Color assigned by community
}

export interface SigmaEdgeAttributes {
  size: number;
  color: string;
  relationType: string;
  type?: string;
  curvature?: number;
  zIndex?: number;
  /**
   * Confidence stored on the deduped graphology edge — set to the MAX
   * confidence across all source-side relationships that mapped onto the
   * same `(source, target)` pair. Used by the edge confidence slider to
   * drop low-confidence edges (e.g. unresolved wikilinks at 0.9).
   */
  confidence?: number;
  /**
   * Set by `applyEdgeDensityFilters` when an edge is below the confidence
   * threshold or both endpoints share the same primary MEMBER_OF Project.
   * The Sigma edgeReducer honors this flag to skip rendering.
   */
  hidden?: boolean;
}

/**
 * Get node size scaled for graph density
 * Uses lower minimums to maintain hierarchy visibility even in huge graphs
 */
const getScaledNodeSize = (baseSize: number, nodeCount: number): number => {
  // Scale factor decreases as graph gets larger
  // But a minimum is used that preserves relative differences
  if (nodeCount > 50000) return Math.max(1, baseSize * 0.4);
  if (nodeCount > 20000) return Math.max(1.5, baseSize * 0.5);
  if (nodeCount > 5000) return Math.max(2, baseSize * 0.65);
  if (nodeCount > 1000) return Math.max(2.5, baseSize * 0.8);
  return baseSize;
};

/**
 * Get mass for node type - higher mass = more repulsion in ForceAtlas2
 * Folders get MUCH higher mass so they spread out and pull their files with them
 * Vault types (Project/Topic/Note/Person/Tag) get specialized mass for knowledge graph layout
 */
const getNodeMass = (nodeType: NodeLabel, nodeCount: number): number => {
  // Scale mass based on graph size
  const baseMassMultiplier = nodeCount > 5000 ? 2 : nodeCount > 1000 ? 1.5 : 1;

  switch (nodeType) {
    // Code mode node types
    case 'Project':
      return 50 * baseMassMultiplier; // Heaviest - anchors everything
    case 'Package':
      return 30 * baseMassMultiplier; // Very heavy
    case 'Module':
      return 20 * baseMassMultiplier; // Heavy
    case 'Folder':
      return 15 * baseMassMultiplier; // Heavy - blasts folders apart!
    case 'File':
      return 3 * baseMassMultiplier; // Medium - follows folders
    case 'Class':
    case 'Interface':
      return 5 * baseMassMultiplier; // Medium-heavy
    case 'Function':
    case 'Method':
      return 2 * baseMassMultiplier; // Light

    // Vault mode node types - knowledge graph layout
    case 'Topic':
      return 20 * baseMassMultiplier; // Sub-cluster center
    case 'Note':
      return 4 * baseMassMultiplier; // Leaf node
    case 'Person':
      return 3 * baseMassMultiplier; // Connector between clusters
    case 'Tag':
      return 2 * baseMassMultiplier; // Small leaf node

    default:
      return 1; // Default mass
  }
};

/**
 * Converts the KnowledgeGraph to a graphology Graph for Sigma.js
 * Folders are positioned in a wide spread, children positioned NEAR their parents
 *
 * @param knowledgeGraph - The knowledge graph to convert
 * @param communityMemberships - Optional map of nodeId -> communityIndex for community coloring
 */
export const knowledgeGraphToGraphology = (
  knowledgeGraph: KnowledgeGraph,
  communityMemberships?: Map<string, number>,
): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> => {
  const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>();
  const nodeCount = knowledgeGraph.nodes.length;

  // Build parent-child map from hierarchy relationships
  // CONTAINS: Folder -> File
  // DEFINES: File -> Function/Class/Interface/Method
  // IMPORTS: File -> Import
  // parent -> children
  const parentToChildren = new Map<string, string[]>();
  // child -> parent
  const childToParent = new Map<string, string>();

  const hierarchyRelations = new Set(['CONTAINS', 'DEFINES', 'IMPORTS']);

  knowledgeGraph.relationships.forEach((rel) => {
    // These relationships represent parent-child hierarchy for positioning
    if (hierarchyRelations.has(rel.type)) {
      // source CONTAINS/DEFINES/IMPORTS target, so source is parent
      if (!parentToChildren.has(rel.sourceId)) {
        parentToChildren.set(rel.sourceId, []);
      }
      parentToChildren.get(rel.sourceId)!.push(rel.targetId);
      childToParent.set(rel.targetId, rel.sourceId);
    }
  });

  // Create node lookup
  const nodeMap = new Map(knowledgeGraph.nodes.map((n) => [n.id, n]));

  // Separate structural nodes (folders, packages) from content nodes
  const structuralTypes = new Set(['Project', 'Package', 'Module', 'Folder']);
  const structuralNodes = knowledgeGraph.nodes.filter((n) => structuralTypes.has(n.label));

  // Much wider spread for structural nodes - this is the key!
  const structuralSpread = Math.sqrt(nodeCount) * 40;
  // Small jitter for children around their parent
  const childJitter = Math.sqrt(nodeCount) * 3;

  // === CLUSTER-BASED POSITIONING ===
  // Calculate cluster centers - each cluster gets a region of the graph
  const clusterCenters = new Map<number, { x: number; y: number }>();
  if (communityMemberships && communityMemberships.size > 0) {
    // Find unique community IDs
    const communities = new Set(communityMemberships.values());
    const communityCount = communities.size;
    const clusterSpread = structuralSpread * 0.8; // Clusters spread across 80% of graph

    // Position cluster centers using golden angle for even distribution
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    let idx = 0;
    communities.forEach((communityId) => {
      const angle = idx * goldenAngle;
      const radius = clusterSpread * Math.sqrt((idx + 1) / communityCount);
      clusterCenters.set(communityId, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
      idx++;
    });
  }
  // Jitter within cluster (tighter than childJitter)
  const clusterJitter = Math.sqrt(nodeCount) * 1.5;

  // Store positions for parent lookup
  const nodePositions = new Map<string, { x: number; y: number }>();

  // Position structural nodes (folders, etc.) in a wide radial pattern FIRST
  structuralNodes.forEach((node, index) => {
    // Use golden angle for even distribution
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = index * goldenAngle;
    const radius = structuralSpread * Math.sqrt((index + 1) / Math.max(structuralNodes.length, 1));

    // Add some randomness to prevent perfect patterns
    const jitter = structuralSpread * 0.15;
    const x = radius * Math.cos(angle) + (Math.random() - 0.5) * jitter;
    const y = radius * Math.sin(angle) + (Math.random() - 0.5) * jitter;

    nodePositions.set(node.id, { x, y });

    const baseSize = NODE_SIZES[node.label] || 8;
    const scaledSize = getScaledNodeSize(baseSize, nodeCount);

    // Structural nodes keep their type-based color
    graph.addNode(node.id, {
      x,
      y,
      size: scaledSize,
      color: NODE_COLORS[node.label] || '#9ca3af',
      label: node.properties.name,
      nodeType: node.label,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      hidden: false,
      mass: getNodeMass(node.label, nodeCount),
    });
  });

  // Process remaining nodes in HIERARCHY ORDER (parents before children)
  // Use BFS starting from structural nodes to ensure parents are positioned first
  const addNodeWithPosition = (nodeId: string) => {
    if (graph.hasNode(nodeId)) return;

    const node = nodeMap.get(nodeId);
    if (!node) return;

    let x: number, y: number;

    // Check if this is a symbol node with a community assignment
    const communityIndex = communityMemberships?.get(nodeId);
    const symbolTypes = new Set(['Function', 'Class', 'Method', 'Interface']);
    const clusterCenter = communityIndex !== undefined ? clusterCenters.get(communityIndex) : null;

    if (clusterCenter && symbolTypes.has(node.label)) {
      // CLUSTER-BASED POSITIONING: Position near cluster center with tight jitter
      x = clusterCenter.x + (Math.random() - 0.5) * clusterJitter;
      y = clusterCenter.y + (Math.random() - 0.5) * clusterJitter;
    } else {
      // HIERARCHY-BASED POSITIONING: Position near parent
      const parentId = childToParent.get(nodeId);
      const parentPos = parentId ? nodePositions.get(parentId) : null;

      if (parentPos) {
        x = parentPos.x + (Math.random() - 0.5) * childJitter;
        y = parentPos.y + (Math.random() - 0.5) * childJitter;
      } else {
        // No parent found - position randomly but still spread out
        x = (Math.random() - 0.5) * structuralSpread * 0.5;
        y = (Math.random() - 0.5) * structuralSpread * 0.5;
      }
    }

    nodePositions.set(nodeId, { x, y });

    const baseSize = NODE_SIZES[node.label] || 8;
    const scaledSize = getScaledNodeSize(baseSize, nodeCount);

    // Check if this node has a community assignment (reuse communityIndex from above)
    const hasCommunity = communityIndex !== undefined;

    // Symbol nodes get colored by community if available
    const usesCommunityColor = hasCommunity && symbolTypes.has(node.label);
    const nodeColor = usesCommunityColor
      ? getCommunityColor(communityIndex!)
      : NODE_COLORS[node.label] || '#9ca3af';

    graph.addNode(nodeId, {
      x,
      y,
      size: scaledSize,
      color: nodeColor,
      label: node.properties.name,
      nodeType: node.label,
      filePath: node.properties.filePath,
      startLine: node.properties.startLine,
      endLine: node.properties.endLine,
      hidden: false,
      mass: getNodeMass(node.label, nodeCount),
      community: communityIndex,
      communityColor: hasCommunity ? getCommunityColor(communityIndex!) : undefined,
    });
  };

  // BFS from structural nodes - this ensures parent is ALWAYS positioned before child
  const queue: string[] = [...structuralNodes.map((n) => n.id)];
  const visited = new Set<string>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    // Get children of current node and add them
    const children = parentToChildren.get(currentId) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        addNodeWithPosition(childId);
        queue.push(childId); // Add to queue so its children are processed too
      }
    }
  }

  // Add any orphan nodes that weren't reached (no parent relationship)
  knowledgeGraph.nodes.forEach((node) => {
    if (!graph.hasNode(node.id)) {
      addNodeWithPosition(node.id);
    }
  });

  // Add edges with distinct colors per relationship type
  const edgeBaseSize = nodeCount > 20000 ? 0.4 : nodeCount > 5000 ? 0.6 : 1.0;

  // Edge styles - each relationship type has a DISTINCT color for clarity
  // Using varied hues so relationships are easily distinguishable
  const EDGE_STYLES: Record<string, { color: string; sizeMultiplier: number }> = {
    // STRUCTURAL - Greens (folder/file hierarchy)
    CONTAINS: { color: '#2d5a3d', sizeMultiplier: 0.4 }, // Forest green - folder contains

    // DEFINITIONS - Cyan/Teal (code definitions)
    DEFINES: { color: '#0e7490', sizeMultiplier: 0.5 }, // Cyan - file defines function/class

    // DEPENDENCIES - Blue (imports between files)
    IMPORTS: { color: '#1d4ed8', sizeMultiplier: 0.6 }, // Blue - file imports file

    // FUNCTION FLOW - Purple (call graph)
    CALLS: { color: '#7c3aed', sizeMultiplier: 0.8 }, // Violet - function calls

    // TYPE RELATIONSHIPS - Warm colors (OOP)
    EXTENDS: { color: '#c2410c', sizeMultiplier: 1.0 }, // Orange - extension
    IMPLEMENTS: { color: '#be185d', sizeMultiplier: 0.9 }, // Pink - interface implementation
  };

  knowledgeGraph.relationships.forEach((rel) => {
    if (graph.hasNode(rel.sourceId) && graph.hasNode(rel.targetId)) {
      const relConfidence = typeof rel.confidence === 'number' ? rel.confidence : 1;
      if (!graph.hasEdge(rel.sourceId, rel.targetId)) {
        const style = EDGE_STYLES[rel.type] || { color: '#4a4a5a', sizeMultiplier: 0.5 };
        const curvature = 0.12 + Math.random() * 0.08;

        graph.addEdge(rel.sourceId, rel.targetId, {
          size: edgeBaseSize * style.sizeMultiplier,
          color: style.color,
          relationType: rel.type,
          type: 'curved',
          curvature: curvature,
          confidence: relConfidence,
        });
      } else {
        // Edge already exists from a prior relationship between this pair —
        // keep the highest confidence so the slider's "min" semantics behave
        // correctly when one of the underlying rels is high-confidence.
        const edgeKey = graph.edge(rel.sourceId, rel.targetId);
        const existing = graph.getEdgeAttribute(edgeKey, 'confidence') ?? 1;
        if (relConfidence > existing) {
          graph.setEdgeAttribute(edgeKey, 'confidence', relConfidence);
        }
      }
    }
  });

  return graph;
};

/**
 * Build a map of nodeId -> primary Project/Community name (the FIRST
 * `MEMBER_OF Project` or `MEMBER_OF Community`
 * relationship encountered). Used by the "Hide intra-cluster edges" filter so
 * we can detect when both endpoints belong to the same cluster.
 *
 * "Primary" is approximate: a node may be MEMBER_OF multiple categories, but
 * for visual de-cluttering it's enough that the first project we see is
 * stable across edges (relationships are built deterministically from the
 * source DB, so iteration order is stable per-graph).
 */
export const computeNodePrimaryProject = (knowledgeGraph: KnowledgeGraph): Map<string, string> => {
  const nodeProject = new Map<string, string>();
  if (knowledgeGraph.relationships.length === 0) return nodeProject;

  const nodeMeta = new Map<string, { label: NodeLabel; name: string }>();
  for (const n of knowledgeGraph.nodes) {
    nodeMeta.set(n.id, {
      label: n.label,
      name: categoryNameForNode(n),
    });
  }

  for (const rel of knowledgeGraph.relationships) {
    if (rel.type !== 'MEMBER_OF') continue;
    const target = nodeMeta.get(rel.targetId);
    if (!target || (target.label !== 'Project' && target.label !== 'Community')) continue;
    if (!nodeProject.has(rel.sourceId)) {
      nodeProject.set(rel.sourceId, target.name);
    }
  }

  return nodeProject;
};

/**
 * Walk the graphology graph and set the `hidden` flag on edges that should
 * be filtered out by the edge density controls in the Filters panel.
 *
 * Two filters are combined:
 *   - confidence < edgeConfidenceMin
 *   - intra-cluster: both endpoints share the same primary MEMBER_OF category
 *
 * Always called from the same useEffect that runs node visibility filters,
 * so callers can rely on `sigma.refresh()` afterwards to repaint.
 */
export const applyEdgeDensityFilters = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
  hideIntraCluster: boolean,
  edgeConfidenceMin: number,
  nodePrimaryProject: Map<string, string> | null,
): void => {
  const noFilters = !hideIntraCluster && edgeConfidenceMin <= 0;
  graph.forEachEdge((edge, attrs, source, target) => {
    if (noFilters) {
      if (attrs.hidden) graph.setEdgeAttribute(edge, 'hidden', false);
      return;
    }

    let hide = false;

    if (edgeConfidenceMin > 0) {
      const c = typeof attrs.confidence === 'number' ? attrs.confidence : 1;
      if (c < edgeConfidenceMin) hide = true;
    }

    if (!hide && hideIntraCluster && nodePrimaryProject) {
      const sp = nodePrimaryProject.get(source);
      const tp = nodePrimaryProject.get(target);
      if (sp && sp === tp) hide = true;
    }

    if (attrs.hidden !== hide) {
      graph.setEdgeAttribute(edge, 'hidden', hide);
    }
  });
};

/**
 * Filter nodes by visibility - sets hidden attribute.
 * Optionally also hides nodes whose IDs appear in `categoryHiddenNodeIds`
 * (used for Project/Topic/Community membership filters).
 */
export const filterGraphByLabels = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
  visibleLabels: NodeLabel[],
  categoryHiddenNodeIds?: Set<string>,
): void => {
  graph.forEachNode((nodeId, attributes) => {
    const isVisibleByLabel = visibleLabels.includes(attributes.nodeType);
    const isHiddenByCategory = categoryHiddenNodeIds?.has(nodeId) ?? false;
    graph.setNodeAttribute(nodeId, 'hidden', !isVisibleByLabel || isHiddenByCategory);
  });
};

/**
 * Get all nodes within N hops of a starting node
 */
export const getNodesWithinHops = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
  startNodeId: string,
  maxHops: number,
): Set<string> => {
  const visited = new Set<string>();
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }];

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (depth < maxHops) {
      graph.forEachNeighbor(nodeId, (neighborId) => {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      });
    }
  }

  return visited;
};

/**
 * Filter nodes by depth from selected node.
 * Optionally also hides nodes whose IDs appear in `categoryHiddenNodeIds`
 * (used for Project/Topic/Community membership filters).
 */
export const filterGraphByDepth = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
  selectedNodeId: string | null,
  maxHops: number | null,
  visibleLabels: NodeLabel[],
  categoryHiddenNodeIds?: Set<string>,
): void => {
  if (maxHops === null) {
    filterGraphByLabels(graph, visibleLabels, categoryHiddenNodeIds);
    return;
  }

  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    filterGraphByLabels(graph, visibleLabels, categoryHiddenNodeIds);
    return;
  }

  const nodesInRange = getNodesWithinHops(graph, selectedNodeId, maxHops);

  graph.forEachNode((nodeId, attributes) => {
    const isLabelVisible = visibleLabels.includes(attributes.nodeType);
    const isInRange = nodesInRange.has(nodeId);
    const isHiddenByCategory = categoryHiddenNodeIds?.has(nodeId) ?? false;
    graph.setNodeAttribute(nodeId, 'hidden', !isLabelVisible || !isInRange || isHiddenByCategory);
  });
};
