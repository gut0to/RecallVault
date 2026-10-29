import { z } from 'zod';
import { projectSchema, type MemoryInput } from './schema.js';

const captureSchema = z.object({ project: projectSchema, reference: z.string().trim().min(1).max(1800), text: z.string().max(200000) }).strict();
const kinds = { decision: 'decision', fact: 'fact', lesson: 'lesson', preference: 'preference', task: 'task', decisão: 'decision', fato: 'fact', aprendizado: 'lesson', tarefa: 'task' } as const;
/** Extract explicitly marked lines as unconfirmed candidates, never automatic facts. */
export function captureCandidates(input: z.input<typeof captureSchema>): { candidates: MemoryInput[]; ignoredLines: number } {
  const options = captureSchema.parse(input), candidates: MemoryInput[] = [];
  const lines = options.text.split(/\r?\n/); let ignoredLines = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    const match = /^(?:[-*]\s*)?\[(decision|fact|lesson|preference|task|decisão|fato|aprendizado|tarefa)\]\s+(.+)$/iu.exec(line);
    if (!match) { if (line) ignoredLines++; continue; }
    const content = match[2]!.trim();
    if (content.length > 20000 || candidates.length >= 100) throw new Error('Capture exceeds per-memory or batch limits');
    candidates.push({ project: options.project, title: content.slice(0, 160), content,
      kind: kinds[match[1]!.toLowerCase() as keyof typeof kinds], status: 'hypothesis',
      sources: [{ reference: options.reference + '#L' + (index + 1), excerpt: line }], tags: ['capture-review'] });
  }
  return { candidates, ignoredLines };
}
