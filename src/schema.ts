import { z } from 'zod';

export const projectSchema = z.string().trim().min(1).max(120);
export const idSchema = z.uuid();
export const sourceSchema = z.object({
  reference: z.string().trim().min(1).max(2000),
  excerpt: z.string().trim().min(1).max(4000).optional(),
}).strict();
export const memoryInputSchema = z.object({
  project: projectSchema,
  title: z.string().trim().min(1).max(200).refine(s => !/[\r\n]/.test(s), 'Title must be one line'),
  content: z.string().trim().min(1).max(20000),
  kind: z.enum(['decision', 'fact', 'lesson', 'preference', 'task']),
  status: z.enum(['confirmed', 'hypothesis']).default('confirmed'),
  sources: z.array(sourceSchema).min(1).max(20),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
}).strict();

export const metadataSchema = memoryInputSchema.omit({ content: true }).extend({
  recallvault: z.literal(1),
  id: idSchema,
  status: z.enum(['confirmed', 'hypothesis', 'superseded']),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
  supersedes: idSchema.optional(),
  superseded_by: idSchema.optional(),
}).strict();

export type MemoryInput = z.input<typeof memoryInputSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Memory = Metadata & { content: string; path: string };

export const searchSchema = z.object({
  project: projectSchema,
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(5),
  maxChars: z.number().int().min(200).max(20000).default(6000),
  includeHypotheses: z.boolean().default(false),
  includeSuperseded: z.boolean().default(false),
}).strict();
export type SearchInput = z.input<typeof searchSchema>;
export type SearchResult = {
  id: string; title: string; project: string; kind: Metadata['kind']; status: Metadata['status'];
  path: string; sources: Metadata['sources']; content: string; truncated: boolean; reason: string;
};

export class VaultError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'VaultError'; }
}
