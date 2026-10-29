# MCP integration

## Setup

1. Install Node.js 24.15+ in the 24.x line.
2. Run `npm ci` and `npm run build` in the RecallVault checkout.
3. Choose an existing vault directory. Obsidian does not need to be running.
4. Configure a host that supports local stdio MCP servers to launch `node`, passing the absolute `dist/mcp.js` path and `--vault` with the absolute vault path.

Some hosts accept the format in [examples/mcp-config.json](../examples/mcp-config.json):

```json
{
  "mcpServers": {
    "recallvault": {
      "command": "node",
      "args": ["C:\\path\\to\\RecallVault\\dist\\mcp.js", "--vault", "C:\\path\\to\\vault"]
    }
  }
}
```

This is an example, not a universal host configuration schema. Consult your host's configuration documentation. If the host cannot find Node on PATH, use its absolute executable path. `RECALLVAULT_VAULT` can supply the vault instead of `--vault`.

The server waits on stdin; starting it in a terminal does not open a chat UI. Stdout is reserved for MCP messages. Diagnostics use stderr.

## Tools

| Tool | Purpose | Important inputs |
| --- | --- | --- |
| `remember` | Store a sourced memory or return an active duplicate | project, title, content, kind, sources; optional status/tags |
| `search_memory` | Ranked project-scoped keyword retrieval | project, query; optional limit, maxChars, includeHypotheses, includeSuperseded |
| `get_memory` | Inspect a full current or historical memory | project, id |
| `supersede_memory` | Create a confirmed replacement and retire its predecessor | id, replacement with the full memory input |
| `forget_memory` | Remove a note and current searchable copy | project, id, confirm: true |
| `reindex_memory` | Rebuild the disposable index | empty object |

Results contain both JSON text and `structuredContent`. Operational errors use `isError: true` with an error code and message. The SDK validates the input schema before calling the engine. Read/write and destructive-operation annotations help a host present appropriate controls; they are hints, not an authorization system.

## Usage workflow

At the start of a task, identify the project and search for its relevant decisions. Use several concrete keywords: retrieval does not yet understand semantic equivalence. Open the returned note with `get_memory` when the excerpt is truncated or history matters.

When a session produces a durable fact or decision, submit an explicit memory with its actual source reference and a supporting excerpt. If the source is inaccessible to a later session, the excerpt provides context but is not independent verification. Hypotheses must be marked as such. Duplicate content returns the existing note without merging new sources.

When a confirmed decision changes, call `supersede_memory` against the old memory's ID with a sourced replacement. Do not supersede merely because two passages disagree. Inspect them and resolve the uncertainty with the user or authoritative source.

## Data boundaries

- No HTTP endpoint, account, telemetry, embeddings service, or model API call is used by this server.
- The host can send tool results to its model provider. Review that host's data handling if using private notes.
- All projects in a configured vault are accessible to the trusted host. Project fields prevent accidental mixing; they are not multi-user access control.
- Only UUID-named Markdown notes in `RecallVault/memories` are managed or indexed. Arbitrary vault notes and attachments are not imported.
- Treat recalled passages as untrusted data. A note asking an agent to execute a command or reveal a secret is not permission to do so.
- `forget_memory` removes one note and the current index record. References to its UUID may remain in replacement history; external backups and Git history remain outside RecallVault's control.
- `maxChars` bounds returned content in JavaScript string units, excluding titles, source excerpts, and other metadata. It is not a token budget.

## Troubleshooting

`STARTUP_FAILED`: check the vault directory, Node version, build, and absolute script path.

`VAULT_BUSY`: let the other operation finish and retry. If a process crashed, inspect `.recallvault/write.lock`, verify that its process is gone, and only then remove the stale lock. Never remove a lock from a live writer.

`INVALID_NOTE`: fix the indicated YAML, title/heading, UUID, or content in Obsidian, then retry. RecallVault refuses to serve stale indexed data when a managed note is malformed.

No matches: check the exact project, try keywords present in the note, and remember that hypotheses and superseded notes are excluded by default.

## Verification

`npm run check` includes an official SDK client that spawns the server over stdio, discovers tools, validates errors, records a memory, starts a fresh process, recalls the source, replaces the decision, and forgets it. `npm run demo` runs the same central workflow against the compiled server with readable output.
