# RecallVault

Persistent, inspectable memory for AI agents, backed by your Obsidian vault.

RecallVault turns project decisions, confirmed facts, and lessons into ordinary Markdown notes. Agents can recover the relevant context in a later session, trace it to its source, and retire outdated knowledge.

**Status:** early MVP. The memory engine and CLI are implemented; MCP integration follows in a separate pull request. Search is lexical; memories are supplied explicitly by a user or agent.

## Quickstart

Requirements: Node.js 24.15+ in the 24.x line and npm. No running Obsidian instance or model API key is needed.

```sh
git clone https://github.com/gut0to/RecallVault.git
cd RecallVault
npm ci
npm run build
node -e "require('fs').mkdirSync('.work/demo-vault',{recursive:true})"
node dist/cli.js init --vault .work/demo-vault
node dist/cli.js remember --vault .work/demo-vault --input examples/decision.json
node dist/cli.js search --vault .work/demo-vault --project demo-api --query "offline SQLite"
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Until the implementation PRs are merged, check out `feat/memory-engine` for this quickstart.

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

## How persistence works

Notes are ordinary Markdown with YAML properties and UUID filenames. Editing content in Obsidian is reflected on the next search. If you rename a memory title, update both the `title` property and heading. Deleting a managed note removes it from the index at the next operation. Invalid managed notes cause an actionable error instead of returning stale index data.

Supersession creates a new note linked to its predecessor. Default retrieval suppresses old decisions. Forgetting deletes the selected current note and its current index data; it does not erase external backups or Git history. A superseded predecessor stays retired when its replacement is forgotten.

## Development

```sh
npm ci
npm run check
```

Checks cover cross-session persistence, project boundaries, hypotheses, external edits, duplicate detection, supersession, interrupted writes, forgetting, budgets, Portuguese search, path confinement, and CLI subprocesses. CI runs on Linux and Windows.

## Current limitations

- Ranked keyword retrieval, not embedding or semantic search.
- Each operation rescans managed notes and rebuilds the index; not yet optimized for large vaults.
- No automatic transcript extraction or contradiction resolution.
- Cooperating writers use a lock. After a crash, verify the process is gone before removing a stale `.recallvault/write.lock`.
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
