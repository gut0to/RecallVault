import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    encoding: 'utf8',
    timeout: 15000,
  });
test('CLI creates and retrieves a memory from a subsequent process', (t) => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-cli-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  assert.equal(run('init', '--vault', vault).status, 0);
  const saved = run('remember', '--vault', vault, '--input', 'examples/decision.json');
  assert.equal(saved.status, 0, saved.stderr);
  const id = JSON.parse(saved.stdout).memory.id;
  const result = run('search', '--vault', vault, '--project', 'demo-api', '--query', 'SQLite');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).results[0].id, id);
  const forget = run('forget', '--vault', vault, '--project', 'demo-api', '--id', id);
  assert.equal(forget.status, 1);
  assert.match(forget.stderr, /CONFIRM_REQUIRED/);
  assert.equal(
    run('forget', '--vault', vault, '--project', 'demo-api', '--id', id, '--confirm').status,
    0,
  );
});
test('CLI gives actionable errors and help', () => {
  assert.match(run('--help').stdout, /persistent project memory/);
  const invalid = run('unknown');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /INVALID_COMMAND/);
});

test('CLI exposes filtered retrieval and project handoffs', (t) => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-cli-context-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  assert.equal(run('remember', '--vault', vault, '--input', 'examples/decision.json').status, 0);
  assert.equal(JSON.parse(run('stats', '--vault', vault, '--project', 'demo-api').stdout).total, 1);
  assert.equal(
    JSON.parse(
      run('list', '--vault', vault, '--project', 'demo-api', '--status', 'confirmed').stdout,
    ).total,
    1,
  );
  const result = run(
    'context',
    '--vault',
    vault,
    '--project',
    'demo-api',
    '--query',
    'SQLite',
    '--kind',
    'decision',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).markdown, /session:demo-planning/);
});

test('CLI reviews captured notes before ingestion and exports portable data', (t) => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-cli-import-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const transcript = path.join(vault, 'notes.txt'),
    plan = path.join(vault, 'plan.json'),
    out = path.join(vault, 'export.jsonl');
  writeFileSync(transcript, '[decision] SQLite works offline.');
  assert.equal(
    run(
      'capture',
      '--vault',
      vault,
      '--project',
      'demo',
      '--input',
      transcript,
      '--reference',
      'session:cli',
      '--output',
      plan,
    ).status,
    0,
  );
  assert.equal(JSON.parse(run('batch', '--vault', vault, '--input', plan).stdout).dryRun, true);
  assert.equal(JSON.parse(run('stats', '--vault', vault, '--project', 'demo').stdout).total, 0);
  assert.equal(run('batch', '--vault', vault, '--input', plan, '--apply').status, 0);
  assert.equal(run('export', '--vault', vault, '--project', 'demo', '--output', out).status, 0);
  assert.match(readFileSync(out, 'utf8'), /hypothesis/);
  assert.equal(run('export', '--vault', vault, '--project', 'demo', '--output', out).status, 1);
  assert.equal(JSON.parse(run('doctor', '--vault', vault).stdout).healthy, true);
});
