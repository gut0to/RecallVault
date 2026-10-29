import { parse, stringify } from 'yaml';
import { metadataSchema, VaultError, type Memory, type Metadata } from './schema.js';

export function serializeMemory(meta: Metadata, content: string): string {
  return `---\n${stringify(meta, { lineWidth: 0 })}---\n\n# ${meta.title}\n\n${content.trim()}\n`;
}

export function parseMemory(raw: string, relativePath: string): Memory {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new VaultError('INVALID_NOTE', `Missing YAML frontmatter: ${relativePath}`);
  try {
    const meta = metadataSchema.parse(parse(match[1]!, { maxAliasCount: 0 }));
    let body = match[2]!.trim();
    const lines = body.split(/\r?\n/);
    if (lines[0]?.startsWith('# ')) {
      if (lines[0].slice(2) !== meta.title)
        throw new Error('Heading and title differ; update both');
      body = lines.slice(1).join('\n').trim();
    }
    if (!body || body.length > 20000) throw new Error('Content must contain 1 to 20000 characters');
    return { ...meta, content: body, path: relativePath };
  } catch (error) {
    throw new VaultError(
      'INVALID_NOTE',
      `Invalid memory ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
