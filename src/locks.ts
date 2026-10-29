import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { VaultError } from './schema.js';

function lockPath(vault: string): string {
  const root = realpathSync(vault),
    cache = path.join(root, '.recallvault'),
    lock = path.join(cache, 'write.lock');
  for (const file of [cache, lock]) {
    try {
      if (lstatSync(file).isSymbolicLink())
        throw new VaultError('UNSAFE_PATH', 'Refusing a linked lock path');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return lock;
}
export function inspectLock(vault: string): {
  locked: boolean;
  pid: number | null;
  alive: boolean | null;
} {
  const file = lockPath(vault);
  if (!existsSync(file)) return { locked: false, pid: null, alive: null };
  let pid: number;
  try {
    pid = Number(JSON.parse(readFileSync(file, 'utf8')).pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error();
  } catch {
    return { locked: true, pid: null, alive: null };
  }
  try {
    process.kill(pid, 0);
    return { locked: true, pid, alive: true };
  } catch (error) {
    return {
      locked: true,
      pid,
      alive: (error as NodeJS.ErrnoException).code === 'ESRCH' ? false : null,
    };
  }
}
export function recoverLock(vault: string, confirm: boolean): { recovered: boolean } {
  if (!confirm)
    throw new VaultError('CONFIRM_REQUIRED', 'Lock recovery requires explicit confirmation');
  const file = lockPath(vault);
  if (!existsSync(file)) return { recovered: false };
  const original = readFileSync(file, 'utf8'),
    lock = inspectLock(vault);
  if (lock.alive !== false)
    throw new VaultError(
      'UNSAFE_RECOVERY',
      'Cannot remove a lock whose process is live or cannot be verified',
    );
  if (readFileSync(file, 'utf8') !== original)
    throw new VaultError('VAULT_BUSY', 'Lock changed during inspection; retry');
  unlinkSync(file);
  return { recovered: true };
}
