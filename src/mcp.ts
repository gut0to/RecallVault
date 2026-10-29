#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { MemoryStore } from './store.js';
import { createServer } from './server.js';

try {
  const { values } = parseArgs({ options: { vault: { type: 'string' }, project: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: recallvault-mcp --vault <existing-folder>\nRECALLVAULT_VAULT supplies a default. Communicates using MCP over stdio.');
  } else {
    const vault = values.vault ?? process.env.RECALLVAULT_VAULT;
    if (!vault) throw new Error('Set --vault or RECALLVAULT_VAULT to an existing vault directory');
    const store = new MemoryStore(vault);
    const handle = serveStdio(() => createServer(store, values.project ? {project:values.project} : {}), { onerror: error => console.error(error.message) });
    const shutdown = async () => { await handle.close(); store.close(); };
    process.once('SIGINT', () => { void shutdown(); });
    process.once('SIGTERM', () => { void shutdown(); });
    process.stdin.once('end', () => store.close());
    process.once('exit', () => store.close());
  }
} catch (error) {
  console.error(JSON.stringify({ error: 'STARTUP_FAILED', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
