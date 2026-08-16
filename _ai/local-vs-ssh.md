---
title: Local vs SSH nodes
tags: [ssh, localhost]
updated: 2026-08-16
---

# Local vs SSH

`nodeType` is the source of truth: `local` or `remote`. `is_local_node()` also accepts legacy docs whose host is `localhost` / `127.0.0.1` / `::1` / `0.0.0.0`.

## Localhost

Radio **Localhost** on the node form.

- No host textbox, no SSH port, no SSH credentials
- Stored as `nodeType: local`, `host: localhost`, `sshAuthType: none`
- `run_command` uses `/bin/bash -lc` on this machine (process + files)
- Probe button is **Test local**; errors start with `Local failed:`

## Remote

Radio **Remote (SSH)**.

- Host and SSH port required
- SSH user + `password` or `private_key` required (400 if missing)
- `asyncssh`, connect timeout 10s
- Probe button is **Test SSH**; errors start with `SSH failed:`

## Related

[[data-model]] · [[llama-cpp-engine]] · [[api]]
