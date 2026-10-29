import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseMemory, serializeMemory } from './markdown.js';
import { idSchema, memoryInputSchema, metadataSchema, sourceSchema, projectSchema, searchSchema, listSchema, VaultError,
  type Memory, type MemoryInput, type ListInput, type SearchInput, type SearchResult } from './schema.js';

const NOTE_DIR = 'RecallVault/memories';
const hash = (text: string) => createHash('sha256').update(text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()).digest('hex');

export class MemoryStore {
  readonly vault: string;
  private readonly notes: string;
  private readonly cache: string;
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(vault: string) {
    if (!vault.trim() || !existsSync(vault)) throw new VaultError('VAULT_NOT_FOUND', 'Vault must be an existing directory. Create it explicitly before starting RecallVault.');
    this.vault = realpathSync(vault);
    if (!lstatSync(this.vault).isDirectory()) throw new VaultError('INVALID_VAULT', 'Vault must be a directory');
    this.notes = this.directory('RecallVault', 'memories');
    this.cache = this.directory('.recallvault');
    const dbPath = path.join(this.cache, 'index.sqlite');
    this.rejectLink(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;');
    try { this.withLock(() => this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        status TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, title, content, tags, tokenize='unicode61 remove_diacritics 2');
    `)); } catch (error) { this.db.close(); this.closed = true; throw error; }
  }

  close(): void { if (!this.closed) { this.db.close(); this.closed = true; } }

  private rejectLink(p: string): void {
    try {
      if (lstatSync(p).isSymbolicLink()) throw new VaultError('UNSAFE_PATH', `Symlinks are not supported for managed paths: ${p}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  private directory(...parts: string[]): string {
    let current = this.vault;
    for (const part of parts) {
      current = path.join(current, part);
      this.rejectLink(current);
      if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
      if (!lstatSync(current).isDirectory()) throw new VaultError('UNSAFE_PATH', `Expected a directory: ${current}`);
    }
    return current;
  }

  private withLock<T>(action: () => T): T {
    if (this.closed) throw new VaultError('STORE_CLOSED', 'Memory store is closed');
    this.directory('RecallVault', 'memories'); this.directory('.recallvault');
    const lock = path.join(this.cache, 'write.lock');
    let fd: number;
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new VaultError('VAULT_BUSY', 'Vault is busy. Retry after the other process exits. If it crashed, verify no RecallVault process is running before removing .recallvault/write.lock.');
      throw e;
    }
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, created: new Date().toISOString() })); return action(); }
    finally { closeSync(fd); unlinkSync(lock); }
  }

  private file(id: string): string {
    idSchema.parse(id);
    const result = path.join(this.notes, `${id}.md`); this.rejectLink(result); return result;
  }

  private atomicWrite(memory: Memory): void {
    const { content, path: _path, ...meta } = memory;
    metadataSchema.parse(meta);
    const destination = this.file(memory.id);
    const temporary = path.join(this.notes, `.${randomUUID()}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, serializeMemory(meta, content), 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, destination);
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  private scan(): Memory[] {
    const memories: Memory[] = [];
    for (const entry of readdirSync(this.notes).sort()) {
      if (!entry.endsWith('.md') || !idSchema.safeParse(entry.slice(0, -3)).success) continue;
      const file = path.join(this.notes, entry); this.rejectLink(file);
      const stats = lstatSync(file);
      if (!stats.isFile() || stats.size > 256000) throw new VaultError('INVALID_NOTE', `Memory is not a regular note under 256 KB: ${entry}`);
      const memory = parseMemory(readFileSync(file, 'utf8'), `${NOTE_DIR}/${entry}`);
      if (`${memory.id}.md` !== entry) throw new VaultError('INVALID_NOTE', `Memory ID differs from filename: ${entry}`);
      memories.push(memory);
    }
    const byId = new Map(memories.map(m => [m.id, m]));
    // A replacement note is sufficient to retire its predecessor after a crash between writes.
    for (const memory of memories) {
      if (!memory.supersedes) continue;
      if (memory.supersedes === memory.id) throw new VaultError('INVALID_NOTE', 'A memory cannot supersede itself');
      const predecessor = byId.get(memory.supersedes);
      if (predecessor) {
        if (predecessor.project !== memory.project) throw new VaultError('INVALID_NOTE', 'Replacement chains must stay within a project');
        if (predecessor.superseded_by && predecessor.superseded_by !== memory.id) throw new VaultError('INVALID_NOTE', 'Conflicting replacement chain');
        predecessor.status = 'superseded'; predecessor.superseded_by = memory.id;
      }
    }
    for (const memory of memories) {
      const seen = new Set<string>(); let current: Memory | undefined = memory;
      while (current?.supersedes) {
        if (seen.has(current.id)) throw new VaultError('INVALID_NOTE', 'Cyclic replacement chain');
        seen.add(current.id); current = byId.get(current.supersedes);
      }
    }
    return memories;
  }

  private reconcile(): Memory[] {
    const notes = this.scan();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM memory_fts; DELETE FROM memories;');
      const insert = this.db.prepare('INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)');
      const fts = this.db.prepare('INSERT INTO memory_fts(id,title,content,tags) VALUES (?, ?, ?, ?)');
      for (const memory of notes) {
        insert.run(memory.id, memory.project, memory.title, memory.content, memory.status, hash(memory.content), JSON.stringify(memory));
        fts.run(memory.id, memory.title, memory.content, memory.tags.join(' '));
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return notes;
  }

  addSources(id: string, project: string, sources: unknown): Memory {
    idSchema.parse(id); project = projectSchema.parse(project);
    const additions = sourceSchema.array().min(1).max(20).parse(sources);
    return this.withLock(() => {
      const memory = this.reconcile().find(m => m.id === id && m.project === project);
      if (!memory) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      const unique = new Map(memory.sources.map(source => [JSON.stringify(source), source]));
      for (const source of additions) unique.set(JSON.stringify(source), source);
      if (unique.size > 20) throw new VaultError('SOURCE_LIMIT', 'A memory supports at most 20 source entries');
      if (unique.size === memory.sources.length) return memory;
      const enriched = { ...memory, sources: [...unique.values()], updated: new Date().toISOString() };
      this.atomicWrite(enriched); this.reconcile(); return enriched;
    });
  }

  confirm(id: string, project: string, sources: unknown): Memory {
    idSchema.parse(id); project = projectSchema.parse(project);
    const evidence = sourceSchema.array().min(1).max(20).parse(sources);
    return this.withLock(() => {
      const memory = this.reconcile().find(m => m.id === id && m.project === project);
      if (!memory) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      if (memory.status !== 'hypothesis') throw new VaultError('NOT_HYPOTHESIS', 'Only an active hypothesis can be confirmed');
      const sources = [...new Map([...memory.sources, ...evidence].map(s => [JSON.stringify(s), s])).values()];
      if (sources.length > 20) throw new VaultError('SOURCE_LIMIT', 'A memory supports at most 20 source entries');
      const confirmed: Memory = { ...memory, sources, status: 'confirmed', updated: new Date().toISOString() };
      this.atomicWrite(confirmed); this.reconcile(); return confirmed;
    });
  }

  list(input: ListInput): { memories: Memory[]; total: number; nextOffset: number | null } {
    const options = listSchema.parse(input);
    return this.withLock(() => {
      const matching = this.reconcile().filter(m => m.project === options.project && (!options.status || m.status === options.status) && (!options.kind || m.kind === options.kind))
        .sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
      const memories = matching.slice(options.offset, options.offset + options.limit);
      const next = options.offset + memories.length;
      return { memories, total: matching.length, nextOffset: next < matching.length ? next : null };
    });
  }

  stats(project: string): { project: string; total: number; byStatus: Record<string, number>; byKind: Record<string, number>; tags: string[] } {
    project = projectSchema.parse(project);
    return this.withLock(() => {
      const memories = this.reconcile().filter(m => m.project === project);
      const byStatus: Record<string, number> = { confirmed: 0, hypothesis: 0, superseded: 0 };
      const byKind: Record<string, number> = Object.create(null) as Record<string, number>;
      for (const memory of memories) { byStatus[memory.status] = (byStatus[memory.status] ?? 0) + 1; byKind[memory.kind] = (byKind[memory.kind] ?? 0) + 1; }
      return { project, total: memories.length, byStatus, byKind, tags: [...new Set(memories.flatMap(m => m.tags))].sort() };
    });
  }

  history(id: string, project: string): { memories: Memory[]; missingIds: string[] } {
    idSchema.parse(id); project = projectSchema.parse(project);
    return this.withLock(() => {
      const notes = this.reconcile().filter(m => m.project === project);
      const byId = new Map(notes.map(m => [m.id, m]));
      if (!byId.has(id)) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      const pending = [id], visited = new Set<string>(), memories: Memory[] = [], missingIds: string[] = [];
      while (pending.length) {
        const next = pending.pop()!; if (visited.has(next)) continue; visited.add(next);
        const memory = byId.get(next); if (!memory) { missingIds.push(next); continue; }
        memories.push(memory);
        if (memory.supersedes) pending.push(memory.supersedes);
        if (memory.superseded_by) pending.push(memory.superseded_by);
      }
      return { memories: memories.sort((a,b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)), missingIds: missingIds.sort() };
    });
  }

  reindex(): { indexed: number } { return this.withLock(() => ({ indexed: this.reconcile().length })); }

  private make(input: MemoryInput): Memory {
    const parsed = memoryInputSchema.parse(input);
    const id = randomUUID(); const now = new Date().toISOString();
    return { ...parsed, recallvault: 1, id, created: now, updated: now, path: `${NOTE_DIR}/${id}.md` };
  }

  remember(input: MemoryInput): { memory: Memory; duplicate: boolean } {
    const candidate = this.make(input);
    return this.withLock(() => {
      const notes = this.reconcile();
      const duplicate = notes.find(m => m.project === candidate.project && m.status !== 'superseded' && hash(m.content) === hash(candidate.content));
      if (duplicate) return { memory: duplicate, duplicate: true };
      this.atomicWrite(candidate); this.reconcile();
      return { memory: candidate, duplicate: false };
    });
  }

  get(id: string, project: string): Memory {
    idSchema.parse(id); project = projectSchema.parse(project);
    return this.withLock(() => {
      const found = this.reconcile().find(m => m.id === id && m.project === project);
      if (!found) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      return found;
    });
  }

  supersede(id: string, input: MemoryInput): { previous: Memory; memory: Memory } {
    idSchema.parse(id); const replacement = this.make(input);
    return this.withLock(() => {
      const notes = this.reconcile();
      const previous = notes.find(m => m.id === id && m.project === replacement.project);
      if (!previous) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      if (previous.status === 'superseded') throw new VaultError('ALREADY_SUPERSEDED', 'Supersede the current replacement instead');
      if (replacement.status !== 'confirmed') throw new VaultError('UNCONFIRMED_REPLACEMENT', 'A replacement must be explicitly confirmed');
      if (notes.some(m => m.project === replacement.project && m.status !== 'superseded' && hash(m.content) === hash(replacement.content))) throw new VaultError('DUPLICATE', 'Replacement content already exists; supply a genuinely updated statement');
      replacement.supersedes = id;
      const retired: Memory = { ...previous, status: 'superseded', superseded_by: replacement.id, updated: new Date().toISOString() };
      this.atomicWrite(replacement);
      try { this.atomicWrite(retired); }
      catch (e) { unlinkSync(this.file(replacement.id)); throw e; }
      this.reconcile(); return { previous: retired, memory: replacement };
    });
  }

  forget(id: string, project: string): { forgotten: string } {
    idSchema.parse(id); project = projectSchema.parse(project);
    return this.withLock(() => {
      const memory = this.reconcile().find(m => m.id === id && m.project === project);
      if (!memory) throw new VaultError('NOT_FOUND', 'Memory not found in this project');
      unlinkSync(this.file(id)); this.reconcile();
      return { forgotten: id };
    });
  }

  search(input: SearchInput): { results: SearchResult[]; contentChars: number; budget: number } {
    const options = searchSchema.parse(input);
    const words = options.query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 32) ?? [];
    return this.withLock(() => {
      this.reconcile();
      if (!words.length) return { results: [], contentChars: 0, budget: options.maxChars };
      const match = words.map(word => `"${word}"`).join(' OR ');
      const rows = this.db.prepare(`
        SELECT m.payload FROM memory_fts f JOIN memories m ON m.id=f.id
        WHERE memory_fts MATCH ? AND m.project=?
          AND (m.status='confirmed' OR (?=1 AND m.status='hypothesis') OR (?=1 AND m.status='superseded'))
        ORDER BY bm25(memory_fts, 0, 5, 1, 2), m.id LIMIT ?
      `).all(match, options.project, Number(options.includeHypotheses), Number(options.includeSuperseded), options.limit);
      let remaining = options.maxChars; const results: SearchResult[] = [];
      for (const row of rows) {
        if (remaining <= 0) break;
        const m = JSON.parse(String(row.payload)) as Memory;
        const content = m.content.slice(0, remaining); remaining -= content.length;
        results.push({ id: m.id, title: m.title, project: m.project, kind: m.kind, status: m.status,
          path: m.path, sources: m.sources, content, truncated: content.length < m.content.length,
          reason: 'Ranked keyword match in title, content, or tags; filtered to the requested project and statuses.' });
      }
      return { results, contentChars: options.maxChars - remaining, budget: options.maxChars };
    });
  }
}
