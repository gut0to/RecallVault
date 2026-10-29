# Practical workflows

Commands assume a built checkout and an existing vault. Replace paths and project identifiers deliberately. Examples use synthetic content.

## Capture, review, and confirm

Create session-notes.txt with explicitly marked statements:

```text
Meeting notes
[decision] Use SQLite for the offline prototype.
[task] Measure startup latency before choosing a cache.
[aprendizado] Reproduzir o erro com um banco temporário simplificou o teste.
```

```sh
node dist/cli.js capture --vault /path/to/vault --project demo-api --input session-notes.txt --reference session:planning --output candidates.json
node dist/cli.js batch --vault /path/to/vault --input candidates.json
node dist/cli.js batch --vault /path/to/vault --input candidates.json --apply
node dist/cli.js list --vault /path/to/vault --project demo-api --status hypothesis
```

The first batch command is a preview. Review the candidates file before applying it. Capture records the source line and always creates hypotheses. Supported markers include decision, fact, lesson, preference, task, decisão, fato, aprendizado, and tarefa. Unmarked text is ignored.

To confirm a hypothesis, create evidence.json:

```json
[
  {
    "reference": "review:accepted-architecture",
    "excerpt": "Confirmed SQLite after the offline persistence experiment."
  }
]
```

```sh
node dist/cli.js confirm --vault /path/to/vault --project demo-api --id MEMORY_UUID --input evidence.json
node dist/cli.js add-sources --vault /path/to/vault --project demo-api --id MEMORY_UUID --input more-evidence.json
```

Confirmation preserves the UUID, adds evidence, and moves the note into normal retrieval. Sources are caller-supplied; RecallVault does not independently verify them.

## Recover task context

```sh
node dist/cli.js search --vault /path/to/vault --project demo-api --query "offline SQLite" --mode all --kind decision --tag database
node dist/cli.js context --vault /path/to/vault --project demo-api --query "offline" --prefix --output handoff.md
node dist/cli.js digest --vault /path/to/vault --project demo-api --output project-memory.md
node dist/cli.js history --vault /path/to/vault --project demo-api --id MEMORY_UUID
```

Tags are required together and ASCII case-insensitive. The default keyword mode matches any supplied word; all mode requires every word. Prefix matching is opt-in. Context packs contain matching passages, note paths, memory IDs, and sources. A digest includes all active confirmed memories. Context content budgets exclude metadata and references. Output files are created exclusively; an existing file is never overwritten.

## Transfer active memories

```sh
node dist/cli.js export --vault /path/to/vault --project demo-api --output active-memories.jsonl
node dist/cli.js import --vault /path/to/other-vault --input active-memories.jsonl
node dist/cli.js import --vault /path/to/other-vault --input active-memories.jsonl --apply
```

JSONL imports validate every line before memory writes. They accept at most 100 records and 2 MB per batch. Superseded history and original UUIDs are intentionally omitted from export; importing assigns new identities. Preserve a filesystem backup separately if complete history matters.

## Inspect health and recover locks

```sh
node dist/cli.js stats --vault /path/to/vault --project demo-api
node dist/cli.js doctor --vault /path/to/vault
node dist/cli.js lock --vault /path/to/vault
node dist/cli.js recover-lock --vault /path/to/vault --confirm
```

Doctor reports invalid managed notes and exits nonzero when unhealthy. Lock inspection works without opening SQLite. Recovery refuses a live owner, malformed owner metadata, or a process whose state cannot be established. It does not delete arbitrary temporary files or repair malformed notes automatically.

## Restrict an agent

```sh
node dist/mcp.js --vault /path/to/vault --project demo-api --read-only
```

This instance advertises only memory read operations for demo-api. Derived cache files can still be created and updated. The host's unrelated tools and operating-system access remain outside this restriction.
