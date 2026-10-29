import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore, type MemoryInput } from '../src/index.js';
const input = (extra: Partial<MemoryInput> = {}): MemoryInput => ({ project: 'alpha', title: 'Database', content: 'SQLite supports offline work.', kind: 'decision', sources: [{ reference: 'session:one' }], ...extra });
function fixture(t: {after: (fn: () => void) => void}) {
 const vault=mkdtempSync(path.join(tmpdir(),'recallvault-extra-')); const store=new MemoryStore(vault);
 t.after(()=>{store.close();rmSync(vault,{recursive:true,force:true});}); return {store,vault};
}
test('closed stores fail with a stable error before writing',t=>{
 const {store,vault}=fixture(t);store.close();assert.throws(()=>store.remember(input()),/closed/i);
 assert.equal(readdirSync(path.join(vault,'RecallVault','memories')).length,0);
});

test('project identifiers reject control characters',t=>{const {store}=fixture(t);assert.throws(()=>store.remember(input({project:'alpha\nsecret'})),/control characters/);});

test('edited metadata cannot contradict lifecycle or timestamp ordering',t=>{const {store,vault}=fixture(t);const m=store.remember(input()).memory;const p=path.join(vault,m.path);writeFileSync(p,readFileSync(p,'utf8').replace(/updated:.*$/m,'updated: 2000-01-01T00:00:00.000Z'));assert.throws(()=>store.reindex(),/updated cannot precede/);});

test('failed startup releases its SQLite handle',t=>{const {store,vault}=fixture(t);store.close();const lock=path.join(vault,'.recallvault','write.lock');writeFileSync(lock,'busy');assert.throws(()=>new MemoryStore(vault),/busy/);rmSync(lock);const next=new MemoryStore(vault);next.close();});
