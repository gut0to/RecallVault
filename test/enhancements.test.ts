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

test('metadata rejects a self-referencing history link',async t=>{const {store,vault}=fixture(t);const memory=store.remember(input()).memory;const file=path.join(vault,memory.path);writeFileSync(file,readFileSync(file,'utf8').replace('status: confirmed','status: superseded')+'');const {metadataSchema}=await import('../src/schema.js');const {content,path:relative,...meta}=memory;assert.equal(metadataSchema.safeParse({...meta,status:'superseded',superseded_by:memory.id}).success,false);});

test('source enrichment preserves identity and deduplicates evidence',t=>{const {store}=fixture(t);const m=store.remember(input()).memory;const enriched=store.addSources(m.id,'alpha',[{reference:'session:two'}]);assert.equal(enriched.id,m.id);assert.equal(enriched.sources.length,2);assert.equal(store.addSources(m.id,'alpha',[{reference:'session:two'}]).sources.length,2);assert.throws(()=>store.addSources(m.id,'beta',[{reference:'x'}]),/not found/);});

test('confirmation promotes an existing hypothesis with explicit evidence',t=>{const {store}=fixture(t);const m=store.remember(input({status:'hypothesis'})).memory;const confirmed=store.confirm(m.id,'alpha',[{reference:'test:verified'}]);assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.id,m.id);assert.equal(store.search({project:'alpha',query:'SQLite'}).results.length,1);assert.throws(()=>store.confirm(m.id,'alpha',[{reference:'x'}]),/Only an active hypothesis/);});

test('project browsing supports stable pagination and lifecycle filters',t=>{const {store}=fixture(t);store.remember(input());store.remember(input({content:'Redis caches responses.',status:'hypothesis'}));const page=store.list({project:'alpha',limit:1});assert.equal(page.total,2);assert.equal(page.nextOffset,1);assert.notEqual(store.list({project:'alpha',limit:1,offset:1}).memories[0]?.id,page.memories[0]?.id);assert.equal(store.list({project:'alpha',status:'hypothesis'}).total,1);assert.equal(store.list({project:'beta'}).total,0);});

test('statistics summarize only the selected project',t=>{const {store}=fixture(t);store.remember(input({tags:['offline']}));store.remember(input({project:'beta',content:'Private beta fact.'}));const stats=store.stats('alpha');assert.equal(stats.total,1);assert.equal(stats.byStatus.confirmed,1);assert.deepEqual(stats.tags,['offline']);});

test('decision history traverses replacement chains within one project',t=>{const {store}=fixture(t);const old=store.remember(input()).memory;const next=store.supersede(old.id,input({content:'Postgres serves concurrent writes.'})).memory;assert.equal(store.history(next.id,'alpha').memories.length,2);store.forget(old.id,'alpha');assert.deepEqual(store.history(next.id,'alpha').missingIds,[old.id]);assert.throws(()=>store.history(next.id,'beta'),/not found/);});

test('search can isolate a memory kind',t=>{const {store}=fixture(t);store.remember(input());store.remember(input({kind:'lesson',content:'SQLite needs careful backups.'}));assert.equal(store.search({project:'alpha',query:'SQLite',kind:'lesson'}).results.length,1);assert.equal(store.search({project:'alpha',query:'SQLite',kind:'task'}).results.length,0);});

test('tag filters require all selected tags without widening project scope',t=>{const {store}=fixture(t);store.remember(input({tags:['offline','database']}));store.remember(input({content:'SQLite powers local caches.',tags:['offline']}));assert.equal(store.search({project:'alpha',query:'SQLite',tags:['OFFLINE','database']}).results.length,1);assert.equal(store.search({project:'beta',query:'SQLite',tags:['offline']}).results.length,0);});

test('all-keyword mode narrows multi-term recall',t=>{const {store}=fixture(t);store.remember(input());store.remember(input({title:'Network',content:'SQLite serves online clients.'}));assert.equal(store.search({project:'alpha',query:'SQLite offline',mode:'all'}).results.length,1);assert.equal(store.search({project:'alpha',query:'SQLite offline'}).results.length,2);});

test('prefix matching is explicit and treats query syntax as data',t=>{const {store}=fixture(t);store.remember(input());assert.equal(store.search({project:'alpha',query:'offl'}).results.length,0);assert.equal(store.search({project:'alpha',query:'offl',prefix:true}).results.length,1);});

test('retrieval budgets preserve complete emoji characters',t=>{const {store}=fixture(t);store.remember(input({content:'x'.repeat(199)+'😀 SQLite'}));const result=store.search({project:'alpha',query:'xxxxxxxx',prefix:true,maxChars:200});assert.equal(result.results[0]?.content.length,199);assert.ok(!/[\uD800-\uDBFF]$/.test(result.results[0]!.content));});

test('long-note excerpts include the matching passage',t=>{const {store}=fixture(t);store.remember(input({title:'Architecture',content:'Background. '.repeat(100)+'SQLite fixes offline persistence.'}));const found=store.search({project:'alpha',query:'SQLite',maxChars:200}).results[0]!;assert.match(found.content,/SQLite/);assert.equal(found.truncated,true);});

test('recall explains which query words matched',t=>{const {store}=fixture(t);store.remember(input());assert.deepEqual(store.search({project:'alpha',query:'SQLite unrelated'}).results[0]?.matchedTerms,['SQLite']);});
