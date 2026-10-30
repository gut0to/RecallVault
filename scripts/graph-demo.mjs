import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../dist/index.js';

const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-graph-demo-'));
const store = new MemoryStore(vault);

try {
  const remember = (title, content) => store.remember({
    project: 'demo', title, content, kind: 'decision',
    sources: [{ reference: `session:demo:${title.toLowerCase().replaceAll(' ', '-')}` }],
  }).memory;
  const a = remember('Markdown is canonical', 'Source-of-truth memory is stored in Markdown.');
  const b = remember('SQLite is a rebuildable index', 'Search index can be reconstructed from Markdown.');
  const c = remember('Obsidian is an editor', 'Obsidian edits native Markdown and Graph View links.');

  store.relate(b.id, 'demo', {
    target: a.id, type: 'depends_on', rationale: 'Index data is derived from the Markdown source.',
  });
  store.relate(c.id, 'demo', {
    target: a.id, type: 'supports', rationale: 'Native Markdown notes are editable in Obsidian.',
  });
  const note = readFileSync(path.join(vault, c.path), 'utf8');
  assert.ok(note.includes(`[[${a.id}]]`));
  const graph = store.graph({ project: 'demo', centerId: a.id, depth: 1 });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  const context = store.graphContext({ project: 'demo', centerId: a.id, depth: 1 });
  assert.equal(context.memoryIds.length, 3);
  console.log(JSON.stringify(graph, null, 2));
  console.log(store.graphMermaid({ project: 'demo' }).markdown);
  console.log('Graph demo passed. Native Obsidian links and bounded context verified.');
} finally {
  store.close();
  rmSync(vault, { recursive: true, force: true });
}
