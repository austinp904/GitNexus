export interface GraphScopePreset {
  id: string;
  label: string;
  description: string;
  includePrefixes: string[];
  excludePrefixes?: string[];
  excludeFragments?: string[];
}

export const ALL_SCOPE_PRESET_ID = 'all';

export const GRAPH_SCOPE_PRESETS: GraphScopePreset[] = [
  {
    id: ALL_SCOPE_PRESET_ID,
    label: 'All indexed',
    description: 'Everything in the current graph',
    includePrefixes: [],
  },
  {
    id: 'runtime-app',
    label: 'Runtime App',
    description: 'Product app code without tests, fixtures, or generated data',
    includePrefixes: ['app/src/', 'app/server/'],
    excludeFragments: ['/__tests__/', '/__fixtures__/', '.test.', '.spec.'],
  },
  {
    id: 'solver',
    label: 'Solver',
    description: 'Framing solver code and engine research',
    includePrefixes: ['app/src/lib/framing/', 'framing-engine/', 'notes/engine-research/'],
    excludePrefixes: ['app/src/lib/framing/__fixtures__/'],
  },
  {
    id: 'planner-3d',
    label: 'Planner + 3D',
    description: '2D planner, map/site frame, and Water Pro viewer code',
    includePrefixes: ['app/src/features/planner/', 'app/src/features/map/', 'app/src/lib/site/'],
    excludeFragments: ['/__tests__/', '/__fixtures__/', '.test.', '.spec.'],
  },
  {
    id: 'research-permits',
    label: 'Research/Permits',
    description: 'Permit research, county code vault, and planning notes',
    includePrefixes: [
      'codes-vault/',
      'notes/research/',
      'notes/cca-research/',
      'notes/boathouse-research/',
      'notes/backend-accounts/',
      'notes/architecture/',
      'notes/plans/',
      'PERMIT_WORKFLOW_AGENT_HANDOFF.md',
    ],
  },
  {
    id: 'data-fixtures',
    label: 'Data/Fixtures',
    description: 'Large traces, golden solver files, and site-studio sample data',
    includePrefixes: [
      'app/public/sites/',
      'app/src/lib/framing/__fixtures__/',
      'tools/site-studio/service/sample/',
      'tools/site-studio/dist/sites/',
    ],
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    description: 'Blender/Fusion experiments, site-studio tooling, and sketches',
    includePrefixes: [
      'blender-walkway/',
      'tools/site-studio/',
      'concept-sketches/',
      'research-viewer/',
    ],
    excludePrefixes: [
      'tools/site-studio/dist/',
      'tools/site-studio/node_modules/',
      'tools/site-studio/service/sample/',
    ],
  },
];

export const getGraphScopePreset = (id: string): GraphScopePreset => {
  return GRAPH_SCOPE_PRESETS.find((preset) => preset.id === id) ?? GRAPH_SCOPE_PRESETS[0];
};

const normalizePath = (path?: string | null): string => {
  return (path ?? '').replace(/^\.\//, '');
};

const matchesPrefix = (path: string, prefix: string): boolean => {
  const normalizedPath = normalizePath(path);
  const normalizedPrefix = normalizePath(prefix);
  if (!normalizedPrefix) return true;
  if (normalizedPrefix.endsWith('/')) return normalizedPath.startsWith(normalizedPrefix);
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
};

export const isPathInScopePreset = (
  path: string | undefined,
  preset: GraphScopePreset,
): boolean => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath && preset.id !== ALL_SCOPE_PRESET_ID) return false;
  const included =
    preset.includePrefixes.length === 0 ||
    preset.includePrefixes.some((prefix) => matchesPrefix(normalizedPath, prefix));
  if (!included) return false;

  const excludedByPrefix = preset.excludePrefixes?.some((prefix) =>
    matchesPrefix(normalizedPath, prefix),
  );
  if (excludedByPrefix) return false;

  const excludedByFragment = preset.excludeFragments?.some((fragment) =>
    normalizedPath.includes(fragment),
  );
  return !excludedByFragment;
};
