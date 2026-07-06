import { useMemo } from 'react';
import type { GraphNode } from 'gitnexus-shared';

interface CategoriesPanelProps {
  nodes: GraphNode[];
  hiddenProjects: Set<string>;
  hiddenTopics: Set<string>;
  hiddenCommunities: Set<string>;
  onToggleProject: (projectName: string) => void;
  onToggleTopic: (topicName: string) => void;
  onToggleCommunity: (communityName: string) => void;
}

interface CategoryItem {
  name: string;
  nodeId: string;
  symbolCount?: number;
  clusterCount?: number;
}

const communityName = (node: GraphNode): string => {
  return String(node.properties.heuristicLabel ?? node.properties.name);
};

export const CategoriesPanel = ({
  nodes,
  hiddenProjects,
  hiddenTopics,
  hiddenCommunities,
  onToggleProject,
  onToggleTopic,
  onToggleCommunity,
}: CategoriesPanelProps) => {
  const tree = useMemo(() => {
    const projects = nodes.filter((n) => n.label === 'Project');
    const topics = nodes.filter((n) => n.label === 'Topic');
    const communities = new Map<string, CategoryItem>();

    for (const node of nodes) {
      if (node.label !== 'Community') continue;
      const name = communityName(node);
      const existing = communities.get(name);
      if (existing) {
        existing.clusterCount = (existing.clusterCount ?? 1) + 1;
        existing.symbolCount =
          (existing.symbolCount ?? 0) + Number(node.properties.symbolCount ?? 0);
        continue;
      }
      communities.set(name, {
        name,
        nodeId: node.id,
        symbolCount: Number(node.properties.symbolCount ?? 0),
        clusterCount: 1,
      });
    }

    return {
      projects: projects
        .map((p) => ({ name: String(p.properties.name), nodeId: p.id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      topics: topics
        .map((t) => ({ name: String(t.properties.name), nodeId: t.id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      communities: Array.from(communities.values()).sort(
        (a, b) => (b.symbolCount ?? 0) - (a.symbolCount ?? 0) || a.name.localeCompare(b.name),
      ),
    };
  }, [nodes]);

  return (
    <div className="space-y-4 p-3">
      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
          Code clusters
        </h3>
        {tree.communities.length === 0 ? (
          <div className="px-2 py-1 text-[11px] text-text-muted italic">
            No code clusters in graph
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tree.communities.map((community) => (
              <label
                key={community.name}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={!hiddenCommunities.has(community.name)}
                  onChange={() => onToggleCommunity(community.name)}
                  className="rounded border-border-subtle bg-elevated text-accent focus:ring-accent"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                  {community.name}
                </span>
                <span
                  className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted"
                  title={`${community.clusterCount ?? 1} cluster${
                    (community.clusterCount ?? 1) === 1 ? '' : 's'
                  }`}
                >
                  {(community.symbolCount ?? 0).toLocaleString()}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
          Projects
        </h3>
        {tree.projects.length === 0 ? (
          <div className="px-2 py-1 text-[11px] text-text-muted italic">No projects in graph</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tree.projects.map((p) => (
              <label
                key={p.nodeId}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={!hiddenProjects.has(p.name)}
                  onChange={() => onToggleProject(p.name)}
                  className="rounded border-border-subtle bg-elevated text-accent focus:ring-accent"
                />
                <span className="text-xs text-text-primary">{p.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wide text-text-secondary uppercase">
          Topics
        </h3>
        {tree.topics.length === 0 ? (
          <div className="px-2 py-1 text-[11px] text-text-muted italic">No topics in graph</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tree.topics.map((t) => (
              <label
                key={t.nodeId}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={!hiddenTopics.has(t.name)}
                  onChange={() => onToggleTopic(t.name)}
                  className="rounded border-border-subtle bg-elevated text-accent focus:ring-accent"
                />
                <span className="text-xs text-text-primary">{t.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
