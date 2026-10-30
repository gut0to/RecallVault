# RecallVault

Persistent, inspectable **and connected** project memory for AI agents, backed by Markdown notes compatible with Obsidian. Type-safe knowledge relations can be explored through an MCP graph or the native Obsidian Graph View.

RecallVault turns project decisions, confirmed facts, and lessons into ordinary Markdown notes. Agents can recover the relevant context in a later session, trace it to its source, and retire outdated knowledge.

**Status:** experimental v0.2 graph release with a memory engine, CLI, stdio MCP server, explicit typed graph and native Obsidian wikilinks. Search is lexical; memories and their relations are supplied explicitly by a user or agent. [Leia em português](docs/README.pt-BR.md).

## Quickstart

Requirements: Node.js 24.15+ in the 24.x line and npm. No running Obsidian instance or model API key is needed.

```sh
# Extract the delivered RecallVault ZIP, then enter the project folder.
# The GitHub main branch will contain these additions only after you merge them.
cd RecallVault
npm ci
npm run build
node -e "require('fs').mkdirSync('.work/demo-vault',{recursive:true})"
node dist/cli.js init --vault .work/demo-vault
node dist/cli.js remember --vault .work/demo-vault --input examples/decision.json
node dist/cli.js search --vault .work/demo-vault --project demo-api --query "offline SQLite"
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

Open `.work/demo-vault` as an Obsidian vault to inspect the generated notes, or use an existing vault path. Only `RecallVault/memories` is managed. The `.recallvault` directory is a disposable index; exclude it from vault sync and version control if desired.

### Memory input

Supply JSON like [examples/decision.json](examples/decision.json). Required fields are `project`, `title`, `content`, `kind`, and at least one `sources` entry. Kinds are `decision`, `fact`, `lesson`, `preference`, and `task`; status defaults to `confirmed`, or can be explicitly `hypothesis`. Source references and excerpts are supplied by the caller, not independently verified.

### Commands

```sh
node dist/cli.js --help
node dist/cli.js get --vault /path/to/vault --project demo-api --id MEMORY_UUID
node dist/cli.js supersede --vault /path/to/vault --id MEMORY_UUID --input replacement.json
node dist/cli.js forget --vault /path/to/vault --project demo-api --id MEMORY_UUID --confirm
node dist/cli.js reindex --vault /path/to/vault
```

`RECALLVAULT_VAULT` can replace `--vault`. Commands return JSON on stdout and failures on stderr with a nonzero exit code. Search always requires a project and excludes hypotheses and superseded memories unless explicitly requested. `--max-chars` bounds the sum of returned **content characters**, not metadata or tokens.

## Typed memory graph: beyond keyword search

Each memory can declare a justified relationship to another memory **in the same project**. Four relation types are supported: `supports`, `contradicts`, `depends_on` and `related_to`.

```sh
node dist/cli.js list --vault .work/demo-vault --project demo-api
node dist/cli.js relate --vault .work/demo-vault --project demo-api --id SOURCE_UUID --input examples/relation.json
node dist/cli.js graph --vault .work/demo-vault --project demo-api --id SOURCE_UUID --depth 2
node dist/cli.js graph-context --vault .work/demo-vault --project demo-api --id SOURCE_UUID
node dist/cli.js graph-mermaid --vault .work/demo-vault --project demo-api
```

To test a relation, **create two distinct memories first**, then set `examples/relation.json`'s `target` to the actual destination UUID and `SOURCE_UUID` to the source UUID. The input example uses an invalid placeholder as a real target.

The engine writes `[[destination-UUID]]` wikilinks to the original Markdown note, so Obsidian Graph View shows actual links between memory nodes. The generated section is excluded from the agent-facing content. For agent retrieval, `memory_graph` returns typed nodes and edges, `unrelate_memory` removes obsolete edges, while `graph_context` traverses a bounded neighborhood rather than blindly stuffing the entire vault into context. `graph_mermaid` provides a portable visualization format.

Graph edges are **declared**, never auto-guessed from keyword overlap. Missing or forgotten target UUIDs are reported. Retrieval defaults to confirmed, active memories. [Detailed graph design and usage](docs/graph-memory.md).

## Host the vault and MCP on an Arduino UNO Q

The UNO Q can hold the memory vault and its SQLite index on eMMC, and run the **Node.js 24 ARM64 MCP server** over a private SSH connection. Codex on Windows launches the remote stdio MCP process using Tailscale; no HTTP API, public memory port or paid Obsidian Sync subscription is required. The board is the host, and the PC is only the client.

Use [`deploy/arduino/install.sh`](deploy/arduino/install.sh), the [UNO Q deployment guide](docs/arduino-deployment.md), and the [Codex remote MCP example](examples/codex-remote-mcp.toml). The Obsidian desktop vault can be mirrored to the board using Syncthing, with attention to concurrent edits and backup.

## Reviewed ingestion and handoffs

- [Workflow cookbook](docs/workflows.md): capture marked session notes, review candidates, confirm hypotheses, transfer active memories, and inspect health.
- Filter search/context by `--kind`, repeatable `--tag`, `--mode any|all`, or `--prefix`.
- `context` assembles a task-specific Markdown handoff; `digest` summarizes all active confirmed knowledge.
- `list`, `stats`, and `history` make the memory store inspectable without guessing search keywords.
- `add-sources` enriches evidence; `confirm` promotes an explicitly verified hypothesis.
- Batch/import defaults to preview. Export transfers active memories with fresh identities when imported; it is not a full historical backup.

## How persistence works

Notes are ordinary Markdown with YAML properties and UUID filenames. Editing content in Obsidian is reflected on the next search. If you rename a memory title, update both the `title` property and heading. Deleting a managed note removes it from the index at the next operation. Invalid managed notes cause an actionable error instead of returning stale index data.

Supersession creates a new note linked to its predecessor. Default retrieval suppresses old decisions. Forgetting deletes the selected current note and its current index data; it does not erase external backups or Git history. A superseded predecessor stays retired when its replacement is forgotten.

## Connect an AI agent

Build first, then configure a compatible MCP host to launch:

```sh
node /absolute/path/to/RecallVault/dist/mcp.js --vault /absolute/path/to/your/vault
```

Use the [configuration example](examples/mcp-config.json) and [MCP guide](docs/mcp.md). The host must support local stdio servers; configuration locations and formats vary. Tools cover persistence, retrieval, project browsing, context packs, evidence enrichment, hypothesis confirmation, reviewed ingestion, and decision history. Use `--project <name>` to restrict an instance and `--read-only` to hide memory mutation tools.

RecallVault does not connect itself to existing chats or monitor conversations. A configured host makes the tools available to its agent, and that agent decides when to call them. [Suggested agent instructions](examples/agent-instructions.md) define a practical workflow.

### Run the two-session demo

```sh
npm run demo
```

The demo launches an MCP server process, records a decision, closes the session, and launches a fresh server process to recover it with its original source. It then verifies project isolation and supersedes the decision. It uses synthetic data in a temporary vault and cleans up afterward. It tests protocol and persistence; no LLM is invoked.

Run the graph demonstration without an AI account:

```sh
npm run demo:graph
```

The demo creates three synthetic memories, two justified graph edges, validates an Obsidian backlink and outputs machine-readable JSON plus Mermaid. It uses a temporary vault, not your private notes.

## Development

```sh
npm ci
npm run format
npm run check
```

`npm run evaluate` runs a fixed synthetic retrieval dataset, while `npm run benchmark` measures a temporary local vault. These are reproducible checks, not evidence of semantic retrieval or production performance.

Checks cover cross-session persistence, project boundaries, hypotheses, external edits, duplicate detection, supersession, interrupted writes, forgetting, budgets, Portuguese search, path confinement, and CLI subprocesses. CI includes Linux ARM64, Linux x64 and Windows. **Verify on the actual UNO Q** before claiming deployment success.

## Current limitations

- Ranked keyword retrieval, not embedding or semantic search. Graph edges are explicit and do not automatically extract relationships.
- Each operation still scans managed notes. The index updates only changed or deleted records; large-vault file watching remains future work.
- Capture recognizes explicitly marked transcript lines as unconfirmed candidates. There is no model-based extraction, background conversation monitoring, or automatic contradiction resolution.
- Cooperating writers use a lock. `lock` inspects the owner and `recover-lock --confirm` removes only a lock whose process is verified dead.
- Atomic individual note writes, not a crash-atomic transaction over multiple notes. Replacement links let retrieval retire predecessors after an interrupted replacement.
- Local persistence does not imply local inference: a connected host may send retrieved text to its model provider. Recalled text is untrusted context, never permission to execute instructions.

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
