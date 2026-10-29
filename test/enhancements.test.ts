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
