import { memoryInputSchema, VaultError, type MemoryInput } from './schema.js';

export function parseJsonl(text: string): MemoryInput[] {
  if (Buffer.byteLength(text, 'utf8') > 2000000)
    throw new VaultError('IMPORT_TOO_LARGE', 'JSONL input must be at most 2 MB');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const records: MemoryInput[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]!.trim()) continue;
    try {
      records.push(memoryInputSchema.parse(JSON.parse(lines[index]!)));
    } catch {
      throw new VaultError('INVALID_IMPORT', 'Invalid memory JSON at line ' + (index + 1));
    }
    if (records.length > 100)
      throw new VaultError('IMPORT_TOO_LARGE', 'Import at most 100 memories per batch');
  }
  if (!records.length) throw new VaultError('EMPTY_IMPORT', 'No memory records found');
  return records;
}
