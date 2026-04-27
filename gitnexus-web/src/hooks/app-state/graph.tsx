import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from 'react';
import type { GraphNode, NodeLabel } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../../core/graph/types';
import { DEFAULT_VISIBLE_LABELS, DEFAULT_VISIBLE_EDGES, type EdgeType } from '../../lib/constants';

interface GraphStateContextValue {
  graph: KnowledgeGraph | null;
  setGraph: (graph: KnowledgeGraph | null) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  visibleLabels: NodeLabel[];
  toggleLabelVisibility: (label: NodeLabel) => void;
  visibleEdgeTypes: EdgeType[];
  toggleEdgeVisibility: (edgeType: EdgeType) => void;
  depthFilter: number | null;
  setDepthFilter: (depth: number | null) => void;
  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  // Vault category filters: hide all nodes that belong to a Project (MEMBER_OF)
  // or Topic (TAGGED) whose name appears in these sets.
  hiddenProjects: Set<string>;
  hiddenTopics: Set<string>;
  toggleProject: (name: string) => void;
  toggleTopic: (name: string) => void;
}

const GraphStateContext = createContext<GraphStateContextValue | null>(null);

export const GraphStateProvider = ({ children }: { children: ReactNode }) => {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [visibleLabels, setVisibleLabels] = useState<NodeLabel[]>(DEFAULT_VISIBLE_LABELS);
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<EdgeType[]>(DEFAULT_VISIBLE_EDGES);
  const [depthFilter, setDepthFilter] = useState<number | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [hiddenTopics, setHiddenTopics] = useState<Set<string>>(new Set());

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
      depthFilter,
      setDepthFilter,
      highlightedNodeIds,
      setHighlightedNodeIds,
      hiddenProjects,
      hiddenTopics,
      toggleProject,
      toggleTopic,
    }),
    [
      graph,
      selectedNode,
      visibleLabels,
      visibleEdgeTypes,
      depthFilter,
      highlightedNodeIds,
      hiddenProjects,
      hiddenTopics,
      toggleProject,
      toggleTopic,
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
