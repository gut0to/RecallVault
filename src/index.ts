export { MemoryStore } from './store.js';
export { buildGraph, graphToMermaid } from './graph.js';
export type { GraphResult, GraphNode, GraphEdge } from './graph.js';
export { graphSchema, relationSchema } from './schema.js';
export type { GraphInput } from './schema.js';
export { memoryInputSchema, searchSchema, VaultError } from './schema.js';
export type { Memory, MemoryInput, Metadata, SearchInput, SearchResult } from './schema.js';

export { listSchema } from './schema.js';
export type { ListInput } from './schema.js';
export { parseJsonl } from './exchange.js';
export { captureCandidates } from './capture.js';
export { inspectLock, recoverLock } from './locks.js';
export { createServer } from './server.js';
export type { ServerOptions } from './server.js';
