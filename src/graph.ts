import { graphSchema, VaultError, type GraphInput, type Memory, type Metadata } from './schema.js';

export type GraphNode = Pick<Memory, 'id' | 'title' | 'project' | 'kind' | 'status' | 'path'>;
export type GraphEdge = {
  source: string;
  target: string;
  type: Metadata['relations'][number]['type'] | 'supersedes';
  rationale: string;
};
export type GraphResult = {
  project: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  missingTargets: string[];
  truncated: boolean;
};

export function buildGraph(memories: Memory[], request: GraphInput): GraphResult {
  const options = graphSchema.parse(request);
  const visible = memories.filter((m) =>
    m.project === options.project &&
    (options.includeHypotheses || m.status !== 'hypothesis') &&
    (options.includeSuperseded || m.status !== 'superseded'));
  const byId = new Map(visible.map((m) => [m.id, m]));
  if (options.centerId && !byId.has(options.centerId))
    throw new VaultError('NOT_FOUND', 'Graph center not found or excluded by filters');
  const candidates = new Map<string, GraphEdge>();
  const existing = new Set(memories.filter((m) => m.project === options.project).map((m) => m.id));
  const missing = new Set<string>();
  for (const m of visible) {
    for (const rel of m.relations) {
      const key = `${m.id}:${rel.target}:${rel.type}`;
      if (byId.has(rel.target)) candidates.set(key, {
        source: m.id, target: rel.target, type: rel.type, rationale: rel.rationale,
      });
      else if (!existing.has(rel.target)) missing.add(rel.target);
    }
    if (m.supersedes && byId.has(m.supersedes)) candidates.set(`${m.id}:${m.supersedes}:supersedes`, {
      source: m.id, target: m.supersedes, type: 'supersedes', rationale: 'Decision history',
    });
  }
  const allEdges = [...candidates.values()].sort((a, b) =>
    a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.type.localeCompare(b.type));
  const chosen = new Set<string>();
  const frontier = options.centerId ? [options.centerId] : [...byId.keys()].sort();
  let level = frontier;
  for (let depth = 0; level.length && depth <= (options.centerId ? options.depth : 0); depth++) {
    const next = new Set<string>();
    for (const id of level) {
      if (chosen.size >= options.maxNodes) break;
      chosen.add(id);
      for (const edge of allEdges) {
        if (edge.source === id && !chosen.has(edge.target)) next.add(edge.target);
        if (edge.target === id && !chosen.has(edge.source)) next.add(edge.source);
      }
    }
    level = [...next].sort().filter((id) => !chosen.has(id));
  }
  return {
    project: options.project,
    nodes: [...chosen].sort().map((id) => {
      const m = byId.get(id)!;
      return { id: m.id, title: m.title, project: m.project, kind: m.kind, status: m.status, path: m.path };
    }),
    edges: allEdges.filter((e) => chosen.has(e.source) && chosen.has(e.target)),
    missingTargets: [...missing].sort(),
    truncated: chosen.size < byId.size,
  };
}

export function graphToMermaid(graph: GraphResult): string {
  const ids = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]));
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) {
    const label = node.title.replace(/[\r\n"\[\]<>]/g, ' ').slice(0, 100);
    lines.push(`  ${ids.get(node.id)}["${label}"]`);
  }
  for (const edge of graph.edges) lines.push(`  ${ids.get(edge.source)} -->|${edge.type}| ${ids.get(edge.target)}`);
  return lines.join('\n');
}
