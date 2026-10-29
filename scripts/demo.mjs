import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-demo-'));
const server = fileURLToPath(new URL('../dist/mcp.js', import.meta.url));
let client;
async function session() {
  const connection = new Client({ name: 'recallvault-demo', version: '1.0.0' });
  await connection.connect(
    new StdioClientTransport({ command: process.execPath, args: [server, '--vault', vault] }),
  );
  return connection;
}
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError) throw new Error(JSON.stringify(response));
  return response.structuredContent;
}
try {
  console.log('SESSION A — record a sourced decision');
  client = await session();
  const saved = await call('remember', {
    project: 'demo-api',
    title: 'Offline database decision',
    kind: 'decision',
    status: 'confirmed',
    content:
      'Use SQLite for the offline prototype. Revisit when multiple concurrent writers are required.',
    sources: [
      { reference: 'session:planning', excerpt: 'We agreed on SQLite for the offline prototype.' },
    ],
  });
  console.log(`Saved ${saved.memory.id} as ${saved.memory.path}`);
  await client.close();
  client = undefined;

  console.log('\nSESSION B — start a fresh process with no conversation history');
  client = await session();
  const recalled = await call('search_memory', {
    project: 'demo-api',
    query: 'offline database SQLite',
  });
  assert.equal(recalled.results[0].id, saved.memory.id);
  console.log(`Recalled: ${recalled.results[0].content}`);
  console.log(`Source: ${recalled.results[0].sources[0].reference}`);
  const unrelated = await call('search_memory', { project: 'other-project', query: 'SQLite' });
  assert.equal(unrelated.results.length, 0);

  const replacement = await call('supersede_memory', {
    id: saved.memory.id,
    replacement: {
      project: 'demo-api',
      title: 'Concurrent database decision',
      kind: 'decision',
      status: 'confirmed',
      content: 'Use Postgres because the application now requires multiple concurrent writers.',
      sources: [
        {
          reference: 'session:scale-review',
          excerpt: 'We now need concurrent writers; switch to Postgres.',
        },
      ],
    },
  });
  const updated = await call('search_memory', {
    project: 'demo-api',
    query: 'database SQLite Postgres',
  });
  assert.equal(updated.results.length, 1);
  assert.equal(updated.results[0].id, replacement.memory.id);
  console.log(`\nUpdated decision: ${updated.results[0].content}`);
  console.log('PASS — cross-session recall, provenance, project isolation, and supersession.');
} finally {
  await client?.close();
  rmSync(vault, { recursive: true, force: true });
}
