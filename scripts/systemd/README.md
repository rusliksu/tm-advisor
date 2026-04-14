# TM watcher services

These templates and the sync script keep `tm-auto-watcher.service` and
`tm-shadow-watch.service` aligned with the live `tm-server.service`
`SERVER_ID`.

## Sync on VPS

Run from Windows:

```powershell
pwsh -File .\scripts\sync_tm_watcher_services.ps1
```

Dry-run preview:

```powershell
pwsh -File .\scripts\sync_tm_watcher_services.ps1 -DryRun
```

Apply unit-file changes without restarting the watcher services:

```powershell
pwsh -File .\scripts\sync_tm_watcher_services.ps1 -NoRestart
```

What it does:

- reads `SERVER_ID` from `tm-server.service` on the VPS
- renders both watcher unit files from versioned templates
- installs them into `~/.config/systemd/user/`
- removes the old `tm-auto-watcher.service.d/server-id.conf` drop-in
- reloads systemd
- by default restarts both watcher services; `-NoRestart` skips that
