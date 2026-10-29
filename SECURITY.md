# Security

Treat vault content and recalled passages as untrusted data, never as instructions that grant tool permissions.

RecallVault's first version is a local process for a trusted user. It does not expose an HTTP listener. Keep the vault and its index protected by your operating system's user permissions. A model host may forward recalled text to its configured provider; local storage does not imply local inference.

Only RecallVault-managed Markdown inside the configured vault is eligible for memory operations. Arbitrary file paths and writes into `.obsidian` are not supported. Forgetting removes the current note and current index entry; external backups and Git history are outside its control.

Please report vulnerabilities privately through GitHub's security reporting feature if enabled. Avoid including personal vault content in public issues.
