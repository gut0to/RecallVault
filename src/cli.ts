#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { MemoryStore } from './store.js';
import { VaultError } from './schema.js';

const help = `RecallVault — persistent project memory

Usage: recallvault <command> --vault <existing-folder> [options]

Commands:
  init       Create managed folders and initialize the index
  remember   --input <memory.json>
  search     --project <name> --query <text> [--limit 5] [--max-chars 6000]
             [--include-hypotheses] [--include-superseded]
  get        --project <name> --id <uuid>
  supersede  --id <uuid> --input <replacement.json>
  forget     --project <name> --id <uuid> --confirm
  reindex    Reconcile the search index from managed Markdown notes
  list       --project <name> [--status confirmed|hypothesis|superseded] [--offset 0]
  stats      --project <name>
  history    --project <name> --id <uuid>
  context    --project <name> --query <text>
  digest     --project <name>

Search/context filters: --kind, --tag (repeatable), --mode any|all, --prefix

RECALLVAULT_VAULT supplies a default vault path. All results are JSON.
Use --help to print this message. No network or model API key is required.`;

let store: MemoryStore | undefined;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    vault: { type: 'string' }, input: { type: 'string' }, project: { type: 'string' },
    query: { type: 'string' }, id: { type: 'string' }, limit: { type: 'string' },
    'max-chars': { type: 'string' }, kind: { type:'string' }, status: { type:'string' },
    tag: {type:'string',multiple:true}, mode: {type:'string'}, prefix:{type:'boolean'}, offset:{type:'string'},
    'include-hypotheses': { type: 'boolean' },
    'include-superseded': { type: 'boolean' }, confirm: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const command = positionals[0];
  if (values.help || !command) { console.log(help); }
  else {
    if (positionals.length !== 1 || !['init', 'remember', 'search', 'get', 'supersede', 'forget', 'reindex', 'list', 'stats', 'history', 'context', 'digest'].includes(command)) throw new VaultError('INVALID_COMMAND', 'Unknown command. Run --help.');
    const required = (name: 'input' | 'id' | 'project' | 'query') => {
      const value = values[name]; if (!value) throw new VaultError('MISSING_OPTION', `--${name} is required`); return value;
    };
    const vault = values.vault ?? process.env.RECALLVAULT_VAULT;
    if (!vault) throw new VaultError('MISSING_VAULT', 'Set --vault or RECALLVAULT_VAULT');
    store = new MemoryStore(vault);
    const input = () => JSON.parse(readFileSync(required('input'), 'utf8').replace(/^\uFEFF/, ''));
    let result: unknown;
    switch (command) {
      case 'init': result = { vault: store.vault, ...store.reindex() }; break;
      case 'remember': result = store.remember(input()); break;
      case 'context':
      case 'search': result = store[command === 'context' ? 'context' : 'search']({ project: required('project'), query: required('query'),
        limit: Number(values.limit ?? 5), maxChars: Number(values['max-chars'] ?? 6000),
        kind: values.kind as 'decision' | 'fact' | 'lesson' | 'preference' | 'task' | undefined,
        tags: values.tag ?? [], mode: (values.mode ?? 'any') as 'any' | 'all', prefix: values.prefix ?? false,
        includeHypotheses: values['include-hypotheses'] ?? false, includeSuperseded: values['include-superseded'] ?? false }); break;
      case 'list': result = store.list({project:required('project'),limit:Number(values.limit ?? 20),offset:Number(values.offset ?? 0),
        kind: values.kind as 'decision' | 'fact' | 'lesson' | 'preference' | 'task' | undefined,
        status: values.status as 'confirmed' | 'hypothesis' | 'superseded' | undefined}); break;
      case 'stats': result = store.stats(required('project')); break;
      case 'history': result = store.history(required('id'),required('project')); break;
      case 'digest': result = store.digest(required('project')); break;
      case 'get': result = store.get(required('id'), required('project')); break;
      case 'supersede': result = store.supersede(required('id'), input()); break;
      case 'forget':
        if (!values.confirm) throw new VaultError('CONFIRM_REQUIRED', 'Forgetting removes the current note. Pass --confirm to proceed.');
        result = store.forget(required('id'), required('project')); break;
      case 'reindex': result = store.reindex(); break;
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof VaultError ? error.code : 'INVALID_REQUEST', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally { store?.close(); }
