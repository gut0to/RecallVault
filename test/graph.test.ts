import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore, type MemoryInput } from '../src/index.js';

function setup(t: { after: (fn: () => void) => void }) {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-graph-'));
  const store = new MemoryStore(vault);
  t.after(() => { store.close(); rmSync(vault, { recursive: true, force: true }); });
  const remember = (title: string, project = 'alpha', extra: Partial<MemoryInput> = {}) =>
    store.remember({
      project,
      title,
      content: `${title} was explicitly agreed during planning.`,
      kind: 'decision',
      sources: [{ reference: `session:${title.replaceAll(' ', '-')}` }],
      ...extra,
    }).memory;
  return { vault, store, remember };
}

test('graph stores typed relations and generates native Obsidian wikilinks without contaminating content', (t) => {
  const { vault, store, remember } = setup(t);
  const root = remember('Use Obsidian');
  const leaf = remember('Markdown source');
  const linked = store.relate(root.id, 'alpha', {
    target: leaf.id,
    type: 'depends_on',
    rationale: 'The editor reads Markdown.',
  });
  const note = readFileSync(path.join(vault, linked.path), 'utf8');
  assert.match(note, new RegExp(`\\[\\[${leaf.id}\\]\\]`));
  assert.match(note, /relations:/);
  assert.match(note, /recallvault:links:start/);
  assert.equal(store.get(root.id, 'alpha').content, root.content);
  const graph = store.graph({ project: 'alpha', centerId: root.id });
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.edges[0], {
    source: root.id, target: leaf.id, type: 'depends_on', rationale: 'The editor reads Markdown.',
  });
  assert.match(store.graphMermaid({ project: 'alpha' }).markdown, /flowchart LR/);
  assert.match(store.graphContext({ project: 'alpha', centerId: root.id }).markdown, /Markdown source/);
});

test('graph obeys project boundaries, visibility and scope, and rejects invented targets', (t) => {
  const { store, remember } = setup(t);
  const root = remember('Architecture');
  const other = remember('Other project', 'beta');
  const secret = remember('Unconfirmed assumption', 'alpha', { status: 'hypothesis' });
  assert.throws(() => store.relate(root.id, 'alpha', {
    target: other.id, type: 'supports', rationale: 'Incorrect project',
  }), /Both memories/);
  assert.throws(() => store.relate(root.id, 'alpha', {
    target: root.id, type: 'related_to', rationale: 'Circular',
  }), /Self-relations/);
  assert.throws(() => store.remember({
    project: 'alpha', title: 'Invented citation', content: 'A fabricated relationship.',
    kind: 'fact', sources: [{ reference: 'session:failed' }],
    relations: [{ target: other.id, type: 'supports', rationale: 'Cross-project data' }],
  }), /Relation target must exist/);
  store.relate(root.id, 'alpha', { target: secret.id, type: 'related_to', rationale: 'Needs review' });
  const hidden = store.graph({ project: 'alpha', centerId: root.id });
  assert.equal(hidden.nodes.length, 1);
  assert.equal(hidden.edges.length, 0);
  const visible = store.graph({ project: 'alpha', centerId: root.id, includeHypotheses: true });
  assert.equal(visible.nodes.length, 2);
  assert.equal(visible.edges.length, 1);
  assert.throws(() => store.graph({ project: 'beta', centerId: root.id }), /center not found/);
});

test('graph persists after restart and detects deleted targets and external edits', (t) => {
  const { vault, store, remember } = setup(t);
  const root = remember('Primary');
  const other = remember('Dependent');
  store.relate(root.id, 'alpha', { target: other.id, type: 'supports', rationale: 'Test source' });
  const memoryPath = path.join(vault, root.path);
  const original = readFileSync(memoryPath, 'utf8');
  writeFileSync(memoryPath, original.replace('Test source', 'Reviewed source'));
  const newReader = new MemoryStore(vault);
  t.after(() => newReader.close());
  assert.equal(newReader.graph({ project: 'alpha' }).edges[0]?.rationale, 'Reviewed source');
  store.forget(other.id, 'alpha');
  const graph = newReader.graph({ project: 'alpha' });
  assert.deepEqual(graph.missingTargets, [other.id]);
  assert.equal(graph.edges.length, 0);
});

test('graph enforces bounded neighborhood and explicit relation uniqueness', (t) => {
  const { store, remember } = setup(t);
  const a = remember('First');
  const b = remember('Second');
  const c = remember('Third');
  store.relate(a.id, 'alpha', { target: b.id, type: 'supports', rationale: 'One' });
  store.relate(b.id, 'alpha', { target: c.id, type: 'depends_on', rationale: 'Two' });
  assert.equal(store.graph({ project: 'alpha', centerId: a.id, depth: 1 }).nodes.length, 2);
  assert.equal(store.graph({ project: 'alpha', centerId: a.id, depth: 2 }).nodes.length, 3);
  assert.equal(store.graph({ project: 'alpha', centerId: a.id, depth: 3, maxNodes: 1 }).nodes.length, 1);
  assert.throws(() => store.relate(a.id, 'alpha', {
    target: b.id, type: 'supports', rationale: 'Duplicate',
  }), /already exists/);
  store.unrelate(a.id, 'alpha', b.id, 'supports');
  assert.equal(store.graph({ project: 'alpha' }).edges.length, 1);
  assert.throws(() => store.unrelate(a.id, 'alpha', b.id, 'supports'), /not found/);
});
