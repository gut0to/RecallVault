# RecallVault

Persistent, inspectable memory for AI agents, backed by your Obsidian vault.

RecallVault turns project decisions, confirmed facts, and lessons into ordinary Markdown notes. Agents can recover the relevant context in a later session, trace it to its source, and retire outdated knowledge.

**Status:** initial implementation in two reviewable pull requests: the memory engine, followed by the MCP integration.

## First milestone

An agent saves a decision during one session. A fresh session retrieves it with its original source, without receiving the entire vault.

## Principles

- Markdown is the source of truth; any search index can be rebuilt.
- Every memory has a project, provenance, and explicit status.
- A hypothesis must not silently become a confirmed fact.
- Replaced decisions keep their history and disappear from default retrieval.
- Personal vault content stays outside this source repository.
- No model provider, API key, or network service is required by the memory engine.

## Development plan

See [the architecture](docs/architecture.md), [roadmap](docs/roadmap.md), and [contribution guide](CONTRIBUTING.md).

## License

[MIT](LICENSE).
