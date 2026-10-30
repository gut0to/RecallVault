# Contributing

Start with an issue describing a reproducible problem or a concrete user workflow. Keep pull requests focused and include tests for changes to persistence, retrieval, or the protocol boundary.

Use Node.js 24.15 or newer in the 24.x line, and npm. The implementation PRs provide `npm ci` and `npm run check`.

Never commit a real vault, conversation export, token, or local MCP configuration. Use temporary directories and synthetic data in tests. This project does not need a model API key.

Commit messages follow `type: description`. Link relevant issues in the PR and explain user-visible behavior, validation, and limitations.

## Branches

- `feat/memory-engine`: Markdown storage, SQLite retrieval, lifecycle, CLI, regression tests.
- `feat/mcp-integration`: MCP tools, integration tests, agent instructions, executable demo. Initially based on `feat/memory-engine`; retarget to `main` after the first PR merges.

## Graph and deployment changes

Keep graph relationships explicit, project-scoped and justified. Maintain backward compatibility with older notes lacking `relations`; never add guessed edges based on text similarity. Regression cases belong in `test/graph.test.ts`. Ensure Markdown serialization does not leak generated Obsidian link footers into memory content or the SQLite full-text index.

Changes to remote hosting must not expose an unauthenticated HTTP MCP endpoint or ship private tailnet addresses, vault files or SSH credentials. Run `npm run demo:graph` alongside `npm run check`.
