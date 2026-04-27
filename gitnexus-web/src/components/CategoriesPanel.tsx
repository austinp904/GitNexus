import { useMemo } from 'react';
import type { GraphNode } from 'gitnexus-shared';

interface CategoriesPanelProps {
  nodes: GraphNode[];
  hiddenProjects: Set<string>;
  hiddenTopics: Set<string>;
  onToggleProject: (projectName: string) => void;
  onToggleTopic: (topicName: string) => void;
}

export const CategoriesPanel = ({
  nodes,
  hiddenProjects,
  hiddenTopics,
  onToggleProject,
  onToggleTopic,
}: CategoriesPanelProps) => {
  const tree = useMemo(() => {
    const projects = nodes.filter((n) => n.label === 'Project');
    const topics = nodes.filter((n) => n.label === 'Topic');
    return {
      projects: projects.map((p) => ({ name: String(p.properties.name), nodeId: p.id })),
      topics: topics.map((t) => ({ name: String(t.properties.name), nodeId: t.id })),
    };
  }, [nodes]);

  return (
    <div className="space-y-4 p-3">
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
