import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

async function connect(vault: string, args: string[] = []) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', 'tsx', path.resolve('src/mcp.ts'), '--vault', vault, ...args], stderr: 'pipe' });
  const client = new Client({ name: 'recallvault-test', version: '1.0.0' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw new Error(`${String(error)}\n${stderr}`); }
  return client;
}

type ToolResponse = Awaited<ReturnType<Client['callTool']>>;
function payload(result: ToolResponse): any {
  assert.ok(!result.isError, JSON.stringify(result));
  const text = result.content.find(item => item.type === 'text');
  assert.ok(text && text.type === 'text');
  const parsed = JSON.parse(text.text);
  assert.deepEqual(result.structuredContent, parsed);
  return parsed;
}
const input = {
  project: 'demo', title: 'Database decision', content: 'Use SQLite for the offline single-user prototype.',
  kind: 'decision', sources: [{ reference: 'session:mcp-test', excerpt: 'Choose SQLite for the prototype.' }],
};

test('MCP advertises schemas and read/write annotations', { timeout: 20000 }, async () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-mcp-'));
  let client: Client | undefined;
  try {
    client = await connect(vault);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 14);
    assert.equal(tools.find(t => t.name === 'search_memory')?.annotations?.readOnlyHint, true);
    assert.equal(tools.find(t => t.name === 'forget_memory')?.annotations?.destructiveHint, true);
    assert.ok(tools.find(t => t.name === 'remember')?.inputSchema.required?.includes('sources'));
  } finally { await client?.close(); rmSync(vault, { recursive: true, force: true }); }
});

test('a fresh MCP process recalls previous session memory and enforces lifecycle', { timeout: 30000 }, async () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-session-'));
  let client: Client | undefined;
  try {
    client = await connect(vault);
    const saved = payload(await client.callTool({ name: 'remember', arguments: input }));
    await client.close(); client = await connect(vault);
    const search = payload(await client.callTool({ name: 'search_memory', arguments: { project: 'demo', query: 'SQLite offline' } }));
    assert.equal(search.results[0].id, saved.memory.id);
    assert.equal(search.results[0].sources[0].reference, 'session:mcp-test');
    const isolated = payload(await client.callTool({ name: 'search_memory', arguments: { project: 'other', query: 'SQLite' } }));
    assert.equal(isolated.results.length, 0);
    const replacement = payload(await client.callTool({ name: 'supersede_memory', arguments: { id: saved.memory.id,
      replacement: { ...input, title: 'New database decision', content: 'Use Postgres for concurrent writers.' } } }));
    const old = payload(await client.callTool({ name: 'get_memory', arguments: { id: saved.memory.id, project: 'demo' } }));
    assert.equal(old.status, 'superseded');
    assert.equal(old.superseded_by, replacement.memory.id);
    const forgotten = payload(await client.callTool({ name: 'forget_memory', arguments: { id: replacement.memory.id, project: 'demo', confirm: true } }));
    assert.equal(forgotten.forgotten, replacement.memory.id);
    const absent = await client.callTool({ name: 'get_memory', arguments: { id: replacement.memory.id, project: 'demo' } });
    assert.equal(absent.isError, true);
    const current = payload(await client.callTool({ name: 'search_memory', arguments: { project: 'demo', query: 'SQLite Postgres' } }));
    assert.equal(current.results.length, 0);
  } finally { await client?.close(); rmSync(vault, { recursive: true, force: true }); }
});

test('MCP rejects invalid input before mutation and returns actionable store errors', { timeout: 20000 }, async () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-validation-'));
  let client: Client | undefined;
  try {
    client = await connect(vault);
    const result = await client.callTool({ name: 'remember', arguments: { ...input, sources: [] } });
    assert.equal(result.isError, true);
    assert.equal(payload(await client.callTool({ name: 'reindex_memory', arguments: {} })).indexed, 0);
    const saved = payload(await client.callTool({ name: 'remember', arguments: input }));
    const denied = await client.callTool({ name: 'forget_memory', arguments: { id: saved.memory.id, project: 'demo' } });
    assert.equal(denied.isError, true);
    const wrongProject = await client.callTool({ name: 'get_memory', arguments: { id: saved.memory.id, project: 'other' } });
    assert.equal(wrongProject.isError, true);
    assert.match(JSON.stringify(wrongProject), /NOT_FOUND/);
    assert.equal(payload(await client.callTool({ name: 'reindex_memory', arguments: {} })).indexed, 1);
  } finally { await client?.close(); rmSync(vault, { recursive: true, force: true }); }
});

test('MCP browsing and context tools expose sourced project knowledge', {timeout:20000}, async()=>{
 const vault=mkdtempSync(path.join(tmpdir(),'recallvault-discovery-'));let client:Client|undefined;
 try {client=await connect(vault);const saved=payload(await client.callTool({name:'remember',arguments:input}));
 const context=payload(await client.callTool({name:'build_context',arguments:{project:'demo',query:'SQLite'}}));assert.match(context.markdown,/session:mcp-test/);
 assert.equal(payload(await client.callTool({name:'memory_stats',arguments:{project:'demo'}})).total,1);
 assert.equal(payload(await client.callTool({name:'list_memories',arguments:{project:'demo'}})).total,1);
 assert.equal(payload(await client.callTool({name:'memory_history',arguments:{project:'demo',id:saved.memory.id}})).memories.length,1);
 } finally {await client?.close();rmSync(vault,{recursive:true,force:true});}
});

test('MCP reviewed ingestion and confirmation preserve evidence', {timeout:20000}, async()=>{
 const vault=mkdtempSync(path.join(tmpdir(),'recallvault-ingestion-'));let client:Client|undefined;
 try {client=await connect(vault);const preview=payload(await client.callTool({name:'import_memories',arguments:{memories:[{...input,status:'hypothesis'}]}}));assert.equal(preview.dryRun,true);
 const imported=payload(await client.callTool({name:'import_memories',arguments:{memories:[{...input,status:'hypothesis'}],dryRun:false}}));
 const id=imported.memories[0].id;assert.equal(payload(await client.callTool({name:'confirm_memory',arguments:{id,project:'demo',sources:[{reference:'test:verified'}]}})).status,'confirmed');
 assert.equal(payload(await client.callTool({name:'add_memory_sources',arguments:{id,project:'demo',sources:[{reference:'review:follow-up'}]}})).sources.length,3);
 } finally {await client?.close();rmSync(vault,{recursive:true,force:true});}
});

test('MCP project scope rejects cross-project reads and mixed batches', {timeout:20000}, async()=>{
 const vault=mkdtempSync(path.join(tmpdir(),'recallvault-scope-'));let client:Client|undefined;
 try {client=await connect(vault,['--project','demo']);assert.equal((await client.callTool({name:'search_memory',arguments:{project:'other',query:'SQLite'}})).isError,true);
 assert.equal((await client.callTool({name:'import_memories',arguments:{memories:[input,{...input,project:'other'}],dryRun:false}})).isError,true);
 assert.equal(payload(await client.callTool({name:'memory_stats',arguments:{project:'demo'}})).total,0);
 } finally {await client?.close();rmSync(vault,{recursive:true,force:true});}
});
