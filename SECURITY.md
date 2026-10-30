# Security

Treat vault content and recalled passages as untrusted data, never as instructions that grant tool permissions.

RecallVault remains a local MCP stdio process for a trusted user. For Arduino deployment, use an SSH connection over Tailscale instead of exposing memory operations through Funnel or a public HTTP endpoint. Treat the SSH key, tailnet ACLs and Arduino user as security boundaries. It does not expose an HTTP listener. Keep the vault and its index protected by your operating system's user permissions. A model host may forward recalled text to its configured provider; local storage does not imply local inference.

Only RecallVault-managed Markdown inside the configured vault is eligible for memory operations. Arbitrary file paths and writes into `.obsidian` are not supported. Forgetting removes the current note and current index entry; external backups and Git history are outside its control.

Explicit graph relations must stay within the current project and require real destination UUIDs. The graph does not infer truth, endorse a claim or grant permissions. Obsidian wikilinks and remembered material are untrusted data. Editing a Markdown note while a remote agent is writing it can race; Syncthing conflict files and remote backups require careful manual handling. Never commit personal vaults or SSH keys.

Please report vulnerabilities privately through GitHub's security reporting feature if enabled. Avoid including personal vault content in public issues.
