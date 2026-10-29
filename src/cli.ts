#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { parseJsonl } from './exchange.js';
import { captureCandidates } from './capture.js';
import { inspectLock, recoverLock } from './locks.js';
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

  confirm    --project <name> --id <uuid> --input <sources.json>
  add-sources --project <name> --id <uuid> --input <sources.json>
  batch      --input <memories.json> [--apply]
  import     --input <memories.jsonl> [--apply]
  export     --project <name> [--output <new-file.jsonl>]
  capture    --project <name> --input <notes.txt> --reference <source-id>
  doctor     Diagnose managed note integrity; exits nonzero for unhealthy vaults
  lock       Inspect the writer lock without opening SQLite
  recover-lock --confirm; refuses live or unverifiable lock owners

Batch/import preview by default. --output creates a new file and never overwrites one.
Search/context filters: --kind, --tag (repeatable), --mode any|all, --prefix

RECALLVAULT_VAULT supplies a default vault path. All results are JSON.
Use --help to print this message. No network or model API key is required.`;

let store: MemoryStore | undefined;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      vault: { type: 'string' },
      input: { type: 'string' },
      project: { type: 'string' },
      query: { type: 'string' },
      id: { type: 'string' },
      limit: { type: 'string' },
      'max-chars': { type: 'string' },
      kind: { type: 'string' },
      status: { type: 'string' },
      tag: { type: 'string', multiple: true },
      mode: { type: 'string' },
      prefix: { type: 'boolean' },
      offset: { type: 'string' },
      'include-hypotheses': { type: 'boolean' },
      'include-superseded': { type: 'boolean' },
      apply: { type: 'boolean' },
      output: { type: 'string' },
      reference: { type: 'string' },
      confirm: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(help);
  } else {
    if (
      positionals.length !== 1 ||
      ![
        'init',
        'remember',
        'search',
        'get',
        'supersede',
        'forget',
        'reindex',
        'list',
        'stats',
        'history',
        'context',
        'digest',
        'confirm',
        'add-sources',
        'batch',
        'import',
        'export',
        'capture',
        'doctor',
        'lock',
        'recover-lock',
      ].includes(command)
    )
      throw new VaultError('INVALID_COMMAND', 'Unknown command. Run --help.');
    const required = (name: 'input' | 'id' | 'project' | 'query') => {
      const value = values[name];
      if (!value) throw new VaultError('MISSING_OPTION', `--${name} is required`);
      return value;
    };
    const vault = values.vault ?? process.env.RECALLVAULT_VAULT;
    if (!vault) throw new VaultError('MISSING_VAULT', 'Set --vault or RECALLVAULT_VAULT');
    const readInput = () => {
      const file = required('input');
      if (statSync(file).size > 2000000)
        throw new VaultError('IMPORT_TOO_LARGE', 'Input must be at most 2 MB');
      return readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    };
    if (command === 'lock' || command === 'recover-lock') {
      const result =
        command === 'lock' ? inspectLock(vault) : recoverLock(vault, values.confirm ?? false);
      console.log(JSON.stringify(result, null, 2));
    } else {
      store = new MemoryStore(vault);
      const input = () => JSON.parse(readInput());
      let result: unknown;
      switch (command) {
        case 'init':
          result = { vault: store.vault, ...store.reindex() };
          break;
        case 'confirm':
          result = store.confirm(required('id'), required('project'), input());
          break;
        case 'add-sources':
          result = store.addSources(required('id'), required('project'), input());
          break;
        case 'batch': {
          const data = input();
          result = store.rememberBatch(
            Array.isArray(data) ? data : data.candidates,
            !(values.apply ?? false),
          );
          break;
        }
        case 'import':
          result = store.rememberBatch(parseJsonl(readInput()), !(values.apply ?? false));
          break;
        case 'export':
          result = store.exportProject(required('project'));
          break;
        case 'capture':
          if (!values.reference) throw new VaultError('MISSING_OPTION', '--reference is required');
          result = captureCandidates({
            project: required('project'),
            reference: values.reference,
            text: readInput(),
          });
          break;
        case 'doctor': {
          const report = store.doctor();
          result = report;
          if (!report.healthy) process.exitCode = 1;
          break;
        }
        case 'remember':
          result = store.remember(input());
          break;
        case 'context':
        case 'search':
          result = store[command === 'context' ? 'context' : 'search']({
            project: required('project'),
            query: required('query'),
            limit: Number(values.limit ?? 5),
            maxChars: Number(values['max-chars'] ?? 6000),
            kind: values.kind as 'decision' | 'fact' | 'lesson' | 'preference' | 'task' | undefined,
            tags: values.tag ?? [],
            mode: (values.mode ?? 'any') as 'any' | 'all',
            prefix: values.prefix ?? false,
            includeHypotheses: values['include-hypotheses'] ?? false,
            includeSuperseded: values['include-superseded'] ?? false,
          });
          break;
        case 'list':
          result = store.list({
            project: required('project'),
            limit: Number(values.limit ?? 20),
            offset: Number(values.offset ?? 0),
            kind: values.kind as 'decision' | 'fact' | 'lesson' | 'preference' | 'task' | undefined,
            status: values.status as 'confirmed' | 'hypothesis' | 'superseded' | undefined,
          });
          break;
        case 'stats':
          result = store.stats(required('project'));
          break;
        case 'history':
          result = store.history(required('id'), required('project'));
          break;
        case 'digest':
          result = store.digest(required('project'));
          break;
        case 'get':
          result = store.get(required('id'), required('project'));
          break;
        case 'supersede':
          result = store.supersede(required('id'), input());
          break;
        case 'forget':
          if (!values.confirm)
            throw new VaultError(
              'CONFIRM_REQUIRED',
              'Forgetting removes the current note. Pass --confirm to proceed.',
            );
          result = store.forget(required('id'), required('project'));
          break;
        case 'reindex':
          result = store.reindex();
          break;
      }
      if (values.output) {
        const data = result as { jsonl?: string; markdown?: string };
        const text = data.jsonl ?? data.markdown ?? JSON.stringify(result, null, 2);
        writeFileSync(values.output, text, { encoding: 'utf8', flag: 'wx' });
        console.log(JSON.stringify({ written: values.output }, null, 2));
      } else console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      error: error instanceof VaultError ? error.code : 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
