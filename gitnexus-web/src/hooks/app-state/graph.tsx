import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from 'react';
import type { GraphNode, NodeLabel } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../../core/graph/types';
import { DEFAULT_VISIBLE_LABELS, DEFAULT_VISIBLE_EDGES, type EdgeType } from '../../lib/constants';
import { ALL_SCOPE_PRESET_ID } from '../../lib/scope-presets';

interface GraphStateContextValue {
  graph: KnowledgeGraph | null;
  setGraph: (graph: KnowledgeGraph | null) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  visibleLabels: NodeLabel[];
  toggleLabelVisibility: (label: NodeLabel) => void;
  visibleEdgeTypes: EdgeType[];
  toggleEdgeVisibility: (edgeType: EdgeType) => void;
  activeScopePresetId: string;
  setActiveScopePresetId: (id: string) => void;
  depthFilter: number | null;
  setDepthFilter: (depth: number | null) => void;
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  // Vault category filters: hide all nodes that belong to a Project (MEMBER_OF)
  // or Community (MEMBER_OF), or Topic (TAGGED), whose name appears in these sets.
  hiddenProjects: Set<string>;
  hiddenTopics: Set<string>;
  hiddenCommunities: Set<string>;
  toggleProject: (name: string) => void;
  toggleTopic: (name: string) => void;
  toggleCommunity: (name: string) => void;
  // Edge density filters: hide intra-cluster edges (both endpoints share the
  // same primary MEMBER_OF Project) and drop edges below a confidence floor.
  hideIntraClusterEdges: boolean;
  setHideIntraClusterEdges: (v: boolean) => void;
  edgeConfidenceMin: number;
  setEdgeConfidenceMin: (v: number) => void;
}

const GraphStateContext = createContext<GraphStateContextValue | null>(null);

export const GraphStateProvider = ({ children }: { children: ReactNode }) => {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [visibleLabels, setVisibleLabels] = useState<NodeLabel[]>(DEFAULT_VISIBLE_LABELS);
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<EdgeType[]>(DEFAULT_VISIBLE_EDGES);
  const [activeScopePresetId, setActiveScopePresetId] = useState(ALL_SCOPE_PRESET_ID);
  const [depthFilter, setDepthFilter] = useState<number | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [hiddenTopics, setHiddenTopics] = useState<Set<string>>(new Set());
  const [hiddenCommunities, setHiddenCommunities] = useState<Set<string>>(new Set());
  const [hideIntraClusterEdges, setHideIntraClusterEdges] = useState(false);
  const [edgeConfidenceMin, setEdgeConfidenceMin] = useState(0);

  const toggleProject = useCallback((name: string) => {
    setHiddenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleTopic = useCallback((name: string) => {
    setHiddenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleCommunity = useCallback((name: string) => {
    setHiddenCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleLabelVisibility = useCallback((label: NodeLabel) => {
    setVisibleLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }, []);

  const toggleEdgeVisibility = useCallback((edgeType: EdgeType) => {
    setVisibleEdgeTypes((prev) =>
      prev.includes(edgeType) ? prev.filter((e) => e !== edgeType) : [...prev, edgeType],
    );
  }, []);

  const value = useMemo<GraphStateContextValue>(
    () => ({
      graph,
      setGraph,
      selectedNode,
      setSelectedNode,
      visibleLabels,
      toggleLabelVisibility,
      visibleEdgeTypes,
      toggleEdgeVisibility,
      activeScopePresetId,
      setActiveScopePresetId,
      depthFilter,
      setDepthFilter,
      highlightedNodeIds,
      setHighlightedNodeIds,
      hiddenProjects,
      hiddenTopics,
      hiddenCommunities,
      toggleProject,
      toggleTopic,
      toggleCommunity,
      hideIntraClusterEdges,
      setHideIntraClusterEdges,
      edgeConfidenceMin,
      setEdgeConfidenceMin,
    }),
    [
      graph,
      selectedNode,
      visibleLabels,
      visibleEdgeTypes,
      activeScopePresetId,
      depthFilter,
      highlightedNodeIds,
      hiddenProjects,
      hiddenTopics,
      hiddenCommunities,
      toggleProject,
      toggleTopic,
      toggleCommunity,
      hideIntraClusterEdges,
      edgeConfidenceMin,
    ],
  );

  return <GraphStateContext.Provider value={value}>{children}</GraphStateContext.Provider>;
};

export const useGraphState = (): GraphStateContextValue => {
  const ctx = useContext(GraphStateContext);
  if (!ctx) {
    throw new Error('useGraphState must be used within a GraphStateProvider');
  }
  return ctx;
};
