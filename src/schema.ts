import { z } from 'zod';

export const projectSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value),
    'Project cannot contain control characters',
  );
export const idSchema = z.uuid();
export const sourceSchema = z
  .object({
    reference: z.string().trim().min(1).max(2000),
    excerpt: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export const relationTypeSchema = z.enum(['supports', 'contradicts', 'depends_on', 'related_to']);
export const relationSchema = z.object({
  target: idSchema,
  type: relationTypeSchema,
  rationale: z.string().trim().min(1).max(500),
}).strict();

export const graphSchema = z.object({
  project: projectSchema,
  centerId: idSchema.optional(),
  depth: z.number().int().min(1).max(3).default(1),
  maxNodes: z.number().int().min(1).max(100).default(40),
  includeHypotheses: z.boolean().default(false),
  includeSuperseded: z.boolean().default(false),
}).strict();
export type GraphInput = z.input<typeof graphSchema>;

export const memoryInputSchema = z
  .object({
    project: projectSchema,
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((s) => !/[\r\n]/.test(s), 'Title must be one line'),
    content: z.string().trim().min(1).max(20000).refine(
      (text) => !text.includes('<!-- recallvault:links:start -->'),
      'Reserved graph-link delimiter is not allowed in memory content',
    ),
    kind: z.enum(['decision', 'fact', 'lesson', 'preference', 'task']),
    status: z.enum(['confirmed', 'hypothesis']).default('confirmed'),
    sources: z.array(sourceSchema).min(1).max(20),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    relations: z.array(relationSchema).max(30).default([]),
  })
  .strict();

export const metadataSchema = memoryInputSchema
  .omit({ content: true })
  .extend({
    recallvault: z.literal(1),
    id: idSchema,
    status: z.enum(['confirmed', 'hypothesis', 'superseded']),
    created: z.iso.datetime(),
    updated: z.iso.datetime(),
    supersedes: idSchema.optional(),
    superseded_by: idSchema.optional(),
  })
  .strict()
  .superRefine((meta, ctx) => {
    if (Date.parse(meta.updated) < Date.parse(meta.created))
      ctx.addIssue({ code: 'custom', message: 'updated cannot precede created' });
    if (meta.superseded_by && meta.status !== 'superseded')
      ctx.addIssue({ code: 'custom', message: 'Replacement link requires superseded status' });
    if (meta.relations.some((r) => r.target === meta.id))
      ctx.addIssue({ code: 'custom', message: 'Memory cannot relate to itself' });
    if (new Set(meta.relations.map((r) => `${r.target}:${r.type}`)).size !== meta.relations.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate graph relations' });
    if (meta.id === meta.supersedes || meta.id === meta.superseded_by)
      ctx.addIssue({ code: 'custom', message: 'Memory cannot reference itself' });
  });

export type MemoryInput = z.input<typeof memoryInputSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Memory = Metadata & { content: string; path: string };

export const searchSchema = z
  .object({
    project: projectSchema,
    query: z.string().trim().min(1).max(500),
    mode: z.enum(['any', 'all']).default('any'),
    prefix: z.boolean().default(false),
    limit: z.number().int().min(1).max(20).default(5),
    maxChars: z.number().int().min(200).max(20000).default(6000),
    kind: z.enum(['decision', 'fact', 'lesson', 'preference', 'task']).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    includeHypotheses: z.boolean().default(false),
    includeSuperseded: z.boolean().default(false),
  })
  .strict();
export const listSchema = z
  .object({
    project: projectSchema,
    status: z.enum(['confirmed', 'hypothesis', 'superseded']).optional(),
    kind: z.enum(['decision', 'fact', 'lesson', 'preference', 'task']).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();
export type ListInput = z.input<typeof listSchema>;
export type SearchInput = z.input<typeof searchSchema>;
export type SearchResult = {
  id: string;
  title: string;
  project: string;
  kind: Metadata['kind'];
  status: Metadata['status'];
  path: string;
  sources: Metadata['sources'];
  content: string;
  truncated: boolean;
  matchedTerms: string[];
  reason: string;
};

export class VaultError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}
