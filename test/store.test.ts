import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore, type MemoryInput } from '../src/index.js';

function fixture(t: { after: (fn: () => void) => void }) {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-'));
  const store = new MemoryStore(vault);
  const stores = [store];
  t.after(() => { for (const instance of stores) instance.close(); rmSync(vault, { recursive: true, force: true }); });
  return { store, vault, track: (instance: MemoryStore) => { stores.push(instance); return instance; } };
}
const input = (changes: Partial<MemoryInput> = {}): MemoryInput => ({
  project: 'alpha', title: 'SQLite decision', content: 'SQLite supports the offline prototype.',
  kind: 'decision', sources: [{ reference: 'session:planning-1', excerpt: 'Choose SQLite for the offline prototype.' }], ...changes,
});

test('persists readable Markdown, provenance, and memory across sessions', t => {
  const { store, vault, track } = fixture(t);
  const { memory } = store.remember(input());
  const markdown = readFileSync(path.join(vault, memory.path), 'utf8');
  assert.match(markdown, /recallvault: 1/); assert.match(markdown, /# SQLite decision/);
  store.close(); const next = track(new MemoryStore(vault));
  const recalled = next.search({ project: 'alpha', query: 'offline database SQLite' }).results[0]!;
  assert.equal(recalled.id, memory.id); assert.equal(recalled.sources[0]?.reference, 'session:planning-1');
});

test('project boundaries apply to search, reads, deletion, and replacement', t => {
  const { store } = fixture(t); const { memory } = store.remember(input());
  assert.equal(store.search({ project: 'beta', query: 'SQLite' }).results.length, 0);
  assert.throws(() => store.get(memory.id, 'beta'), /not found/);
  assert.throws(() => store.forget(memory.id, 'beta'), /not found/);
  assert.throws(() => store.supersede(memory.id, input({ project: 'beta', content: 'Use Postgres instead.' })), /not found/);
});

test('deduplicates normalized active content within a project', t => {
  const { store } = fixture(t); const first = store.remember(input());
  const duplicate = store.remember(input({ content: ' SQLITE  supports the OFFLINE prototype. ' }));
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.memory.id, first.memory.id);
  assert.equal(store.remember(input({ project: 'beta' })).duplicate, false);
});

test('hypotheses require explicit inclusion', t => {
  const { store } = fixture(t); store.remember(input({ status: 'hypothesis' }));
  assert.equal(store.search({ project: 'alpha', query: 'SQLite' }).results.length, 0);
  assert.equal(store.search({ project: 'alpha', query: 'SQLite', includeHypotheses: true }).results[0]?.status, 'hypothesis');
});

test('supersession preserves sources and suppresses obsolete decisions', t => {
  const { store } = fixture(t); const { memory } = store.remember(input());
  const replacement = store.supersede(memory.id, input({ title: 'Postgres decision', content: 'Postgres replaces SQLite because we now require concurrent writers.' }));
  assert.equal(store.get(memory.id, 'alpha').superseded_by, replacement.memory.id);
  assert.equal(replacement.memory.supersedes, memory.id);
  const current = store.search({ project: 'alpha', query: 'SQLite' }).results;
  assert.equal(current.length, 1); assert.equal(current[0]?.id, replacement.memory.id);
  assert.equal(store.search({ project: 'alpha', query: 'SQLite', includeSuperseded: true }).results.length, 2);
  assert.throws(() => store.supersede(memory.id, input({ content: 'Another replacement.' })), /current replacement/);
});

test('rejects unconfirmed or duplicate replacement statements', t => {
  const { store } = fixture(t); const { memory } = store.remember(input());
  assert.throws(() => store.supersede(memory.id, input({ status: 'hypothesis', content: 'Maybe Redis.' })), /explicitly confirmed/);
  assert.throws(() => store.supersede(memory.id, input()), /already exists/);
  assert.equal(store.get(memory.id, 'alpha').status, 'confirmed');
});

test('external edits and deletions are reflected on the next retrieval', t => {
  const { store, vault } = fixture(t); const { memory } = store.remember(input());
  const file = path.join(vault, memory.path);
  writeFileSync(file, readFileSync(file, 'utf8').replace('SQLite supports the offline prototype.', 'DuckDB handles analytics locally.'));
  assert.match(store.search({ project: 'alpha', query: 'DuckDB' }).results[0]!.content, /DuckDB/);
  unlinkSync(file); assert.equal(store.search({ project: 'alpha', query: 'DuckDB' }).results.length, 0);
});

test('forgetting purges the current file and searchable index', t => {
  const { store, vault } = fixture(t); const { memory } = store.remember(input());
  store.forget(memory.id, 'alpha');
  assert.throws(() => readFileSync(path.join(vault, memory.path)), /ENOENT/);
  assert.equal(store.search({ project: 'alpha', query: 'SQLite' }).results.length, 0);
  assert.throws(() => store.get(memory.id, 'alpha'), /not found/);
});

test('forgetting a replacement never revives a retired memory', t => {
  const { store } = fixture(t); const original = store.remember(input()).memory;
  const current = store.supersede(original.id, input({ content: 'Use Postgres for concurrent writes.' })).memory;
  store.forget(current.id, 'alpha');
  assert.equal(store.search({ project: 'alpha', query: 'SQLite' }).results.length, 0);
  assert.equal(store.get(original.id, 'alpha').status, 'superseded');
});

test('enforces aggregate content budget and reports truncation', t => {
  const { store } = fixture(t);
  store.remember(input({ content: 'SQLite '.repeat(100) }));
  store.remember(input({ content: 'SQLite offline '.repeat(100) }));
  const result = store.search({ project: 'alpha', query: 'SQLite', maxChars: 250 });
  assert.equal(result.contentChars, 250); assert.equal(result.results[0]?.truncated, true);
  assert.equal(result.results.reduce((sum, item) => sum + item.content.length, 0), 250);
});

test('FTS treats punctuation and SQL-looking input as data', t => {
  const { store } = fixture(t); store.remember(input());
  assert.equal(store.search({ project: 'alpha', query: '"SQLite"; DROP TABLE memories; --' }).results.length, 1);
  assert.deepEqual(store.search({ project: 'alpha', query: '***' }).results, []);
  assert.equal(store.reindex().indexed, 1);
});

test('search is accent insensitive and handles Portuguese', t => {
  const { store } = fixture(t);
  store.remember(input({ content: 'A decisão é manter a aplicação disponível sem conexão.' }));
  assert.equal(store.search({ project: 'alpha', query: 'decisao conexao' }).results.length, 1);
});

test('invalid requests cannot become paths or unbounded searches', t => {
  const { store } = fixture(t);
  assert.throws(() => store.get('../../outside', 'alpha'));
  assert.throws(() => store.remember(input({ sources: [] })));
  assert.throws(() => store.remember(input({ title: 'bad\ntitle' })));
  assert.throws(() => store.search({ project: 'alpha', query: 'x', limit: 999 }));
  assert.throws(() => store.search({ project: '', query: 'x' }));
});

test('malformed managed notes fail closed instead of returning stale data', t => {
  const { store, vault } = fixture(t); const { memory } = store.remember(input());
  writeFileSync(path.join(vault, memory.path), 'broken frontmatter');
  assert.throws(() => store.search({ project: 'alpha', query: 'SQLite' }), /frontmatter/);
});

test('unrelated Obsidian notes are left untouched', t => {
  const { store, vault } = fixture(t);
  writeFileSync(path.join(vault, 'personal.md'), '# My private note');
  store.remember(input()); store.reindex();
  assert.equal(readFileSync(path.join(vault, 'personal.md'), 'utf8'), '# My private note');
});

test('cooperating processes respect the vault lock', t => {
  const { store, vault } = fixture(t); const lock = path.join(vault, '.recallvault', 'write.lock');
  writeFileSync(lock, 'other process');
  assert.throws(() => store.remember(input()), /Vault is busy/);
  unlinkSync(lock); assert.equal(store.remember(input()).duplicate, false);
});

test('managed directory links cannot escape the vault', t => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-link-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'recallvault-outside-'));
  t.after(() => { rmSync(vault, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  mkdirSync(path.join(outside, 'memories'));
  symlinkSync(outside, path.join(vault, 'RecallVault'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => new MemoryStore(vault), /Symlinks/);
});

test('index can be deleted and rebuilt from Markdown', t => {
  const { store, vault, track } = fixture(t); const id = store.remember(input()).memory.id;
  store.close(); unlinkSync(path.join(vault, '.recallvault', 'index.sqlite'));
  const next = track(new MemoryStore(vault));
  assert.equal(next.search({ project: 'alpha', query: 'SQLite' }).results[0]?.id, id);
});

test('replacement note retires predecessor after an interrupted two-file write', t => {
  const { store, vault } = fixture(t); const original = store.remember(input()).memory;
  const originalText = readFileSync(path.join(vault, original.path), 'utf8');
  const replacement = store.supersede(original.id, input({ content: 'Postgres is needed for concurrent writers.' })).memory;
  writeFileSync(path.join(vault, original.path), originalText);
  assert.equal(store.get(original.id, 'alpha').superseded_by, replacement.id);
  assert.ok(store.search({ project: 'alpha', query: 'SQLite' }).results.every(m => m.id !== original.id));
});
