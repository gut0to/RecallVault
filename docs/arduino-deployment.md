# Arduino UNO Q: persistent memory host for Codex

This deployment keeps all managed memory notes and the disposable SQLite FTS5 index on the UNO Q's eMMC. The Codex process runs on the Windows PC, but the MCP process runs **on the UNO Q** through an SSH stdio transport. No network-facing RecallVault HTTP server, Docker container, paid Obsidian service, or cloud AI key is needed.

## Requirements

- UNO Q running the Linux side with Debian, reachable through your existing private Tailscale tailnet.
- Official **Node.js 24.15+ in the 24.x line for Linux arm64** and npm on the board. Check `node -v`, `node -p 'process.arch'` (expect `arm64`). Installing `nodejs` from the Debian repository alone might provide an older version; verify the result.
- OpenSSH server on the board and OpenSSH client on Windows; **key-based SSH** should work without a password prompt.
- Around 4 GB RAM, 32 GB eMMC. Check `df -h` and keep free headroom for OS updates and backups. Avoid indexing large private attachments.
- An Obsidian vault in a local folder on Windows for editing, optionally synced to the board using Syncthing.

## Install on the UNO Q

Transfer the ZIP using `scp` (or clone the repository directly on the board when internet access is available). Extract it into `/home/arduino/RecallVault`.

```sh
cd /home/arduino/RecallVault
node -v
node -p 'process.arch'
RECALLVAULT_VAULT=/home/arduino/RecallVaultVault bash deploy/arduino/install.sh
```

The script creates a separate vault only when required, uses `npm ci`, formats the source using the project Prettier version, builds and runs the suite through `npm run check`, then initializes the index and checks integrity. It does not alter Tailscale, sshd, or firewall settings. Since the repository requires Node 24.15+, do **not** run with Node 22 or a system-installed older Node.

To enable the existing SSH service if it is not already available:

```sh
sudo apt update
sudo apt install openssh-server
sudo systemctl enable --now ssh
```

Check `tailscale ip -4` to get the board's **private** Tailscale IPv4. Tailscale IPs can differ between environments; do not copy an address from screenshots. Restrict SSH to trusted devices using Tailscale policies and/or the board firewall. Do not forward port 22 from your router or publish the vault through Funnel.

## SSH authentication from Windows

Generate a key if you do not already have one (`ssh-keygen -t ed25519`) and install the public key in `/home/arduino/.ssh/authorized_keys` on the board with proper permissions. Keep the private key on Windows. Before adding the MCP, test:

```powershell
ssh -T arduino@100.x.y.z "node -v"
ssh -T arduino@100.x.y.z "node /home/arduino/RecallVault/dist/cli.js stats --vault /home/arduino/RecallVaultVault --project demo-api"
```

A `PROJECT_DENIED`, `VAULT_NOT_FOUND`, SSH password prompt, node version error, or login shell banner must be resolved before the Codex connection. A normal SSH startup should not print interactive banners on the MCP stdout stream.

## Configure Codex on Windows

Use the sample at [`examples/codex-remote-mcp.toml`](../examples/codex-remote-mcp.toml). Merge its `[mcp_servers.recallvault]` section into `%USERPROFILE%\\.codex\\config.toml`, replacing the Tailscale IP if needed. The configuration launches:

```text
ssh -T -o BatchMode=yes arduino@100.x.y.z node /home/arduino/RecallVault/dist/mcp.js --vault /home/arduino/RecallVaultVault
```

The SSH process is the MCP stdio transport. Codex talks to the remote Node process transparently; **Node is not running on Windows**. SSH remains available while the board is on. Each Codex session launches its own MCP process on demand; no second constantly running Node daemon is required. The vault persists even after Codex disconnects.

Alternatively configure the host using:

```powershell
codex mcp add recallvault -- ssh -T -o BatchMode=yes arduino@100.x.y.z node /home/arduino/RecallVault/dist/mcp.js --vault /home/arduino/RecallVaultVault
```

Check `codex mcp list` and the installed Codex version's syntax, because client CLI options can change.

## Obsidian on Windows, vault stored on Arduino

Obsidian edits local Markdown folders, not the remote MCP process directly. For convenient editing, use **Syncthing** between the Windows vault and `/home/arduino/RecallVaultVault` on the board. This copies Markdown both ways; it is not a network filesystem and not the paid Obsidian Sync service.

For a privacy-focused setup, connect the two Syncthing devices by their private Tailscale addresses, disable public discovery/relays if not needed, and keep Syncthing's administration interface bound to loopback. Use `ssh -L 8384:127.0.0.1:8384 arduino@100.x.y.z` to access the board's Syncthing UI only if configured there. Follow Syncthing's current platform-specific installation documentation rather than assuming an app version.

Exclude `.recallvault/` from synchronization using a `.stignore` rule, as the SQLite cache is machine-local and rebuildable. You may also choose to exclude `.obsidian/workspace*.json` to avoid unnecessary layout conflicts. Keep `RecallVault/memories/*.md` synchronized, **including UUID filenames**; they are link targets in Obsidian.

> Syncthing is not transactional across devices. A Codex write on the board racing against an Obsidian edit on Windows may create conflicting copies. Avoid editing the same managed note simultaneously. Review conflict files before deleting anything. Memory sources and replacements are not distributed transactions.

For a single-machine pilot, you can initially keep Obsidian and the vault only on the board and browse files via a trusted SFTP editor, then introduce synchronization after the MCP round-trip works. Obsidian itself does not need to run on the board.

## Backup and recovery

The eMMC is a single point of failure. Keep a second copy **outside the Arduino**; transferring encrypted backups to the Windows PC over Tailscale works without buying hardware. Example from PowerShell when Windows is on:

```powershell
scp -r arduino@100.x.y.z:/home/arduino/RecallVaultVault/RecallVault "$env:USERPROFILE\\Documents\\RecallVault-backup"
```

Use timestamped destination directories, protect private content, and test recovery. For a complete Obsidian vault backup, include your other Markdown files and assets as well. The `.recallvault` index can be regenerated with:

```sh
node /home/arduino/RecallVault/dist/cli.js reindex --vault /home/arduino/RecallVaultVault
```

Deleting a memory through RecallVault does not delete historical remote backups. Privacy retention remains a separate administrative responsibility.

## Validation checklist

1. Board prints `arm64` and a Node version >=24.15 in the 24.x release.
2. `npm run check` succeeds on the board; CI also exercises Linux ARM64.
3. `node dist/cli.js doctor --vault ...` reports a healthy vault.
4. Codex discovers `memory_graph`, `graph_context`, `graph_mermaid`, and `relate_memory`.
5. Save two sourced memories, link them, restart Codex, and recover the typed relation.
6. Open the synchronized vault in Obsidian and inspect the generated `[[UUID]]` links in Graph View.
7. Test a backup and verify the project memory cannot be read from another project scope.
