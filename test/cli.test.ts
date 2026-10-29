import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8', timeout: 15000 });
test('CLI creates and retrieves a memory from a subsequent process', t => {
  const vault = mkdtempSync(path.join(tmpdir(), 'recallvault-cli-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  assert.equal(run('init', '--vault', vault).status, 0);
  const saved = run('remember', '--vault', vault, '--input', 'examples/decision.json');
  assert.equal(saved.status, 0, saved.stderr);
  const id = JSON.parse(saved.stdout).memory.id;
  const result = run('search', '--vault', vault, '--project', 'demo-api', '--query', 'SQLite');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).results[0].id, id);
  const forget = run('forget', '--vault', vault, '--project', 'demo-api', '--id', id);
  assert.equal(forget.status, 1); assert.match(forget.stderr, /CONFIRM_REQUIRED/);
  assert.equal(run('forget', '--vault', vault, '--project', 'demo-api', '--id', id, '--confirm').status, 0);
});
test('CLI gives actionable errors and help', () => {
  assert.match(run('--help').stdout, /persistent project memory/);
  const invalid = run('unknown'); assert.equal(invalid.status, 1); assert.match(invalid.stderr, /INVALID_COMMAND/);
});
