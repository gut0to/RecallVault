# Roadmap

## Milestone 1 — a complete memory round trip

1. Markdown memory schema and vault-contained persistence.
2. Project-scoped FTS5 search with provenance and content budgets.
3. Duplicate detection, supersession, forgetting, and index reconciliation.
4. CLI and a repeatable demo with synthetic data.
5. MCP tools plus tests using a real stdio client.

## Follow-up work

- Model-assisted extraction from transcripts, building on explicit marked-line capture and review.
- Hybrid lexical/embedding retrieval with an offline evaluation dataset.
- Obsidian plugin for review, citation navigation, and lifecycle inspection.
- File-watcher indexing and crash recovery journaling, building on incremental SQLite reconciliation and the reproducible local benchmark.
- Secret redaction and configurable retention policies.

The first version stores explicit structured memories supplied by a user or connected agent. It does not claim automatic extraction, semantic understanding, or automatic contradiction resolution.

## Evaluation

The fixed synthetic retrieval suite covers keyword modes, source evidence, hypotheses, tags, prefixes, and project isolation. Add anonymized real-world fixtures before drawing conclusions about broad retrieval quality. Embedding retrieval should be compared against this lexical baseline.
