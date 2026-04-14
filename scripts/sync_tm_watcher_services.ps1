param(
    [string]$VpsHost = "vps",
    [string]$TmServerService = "tm-server.service",
    [string]$AutoWatcherService = "tm-auto-watcher.service",
    [string]$ShadowWatcherService = "tm-shadow-watch.service",
    [string]$RepoDir = "/home/openclaw/repos/tm-tierlist",
    [string]$BaseUrl = "https://tm.knightbyte.win",
    [switch]$NoRestart,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Invoke-Ssh {
    param([string]$Command)
    & ssh $VpsHost $Command
}

function Get-RemoteServerId {
    $envLine = Invoke-Ssh "systemctl --user show -p Environment $TmServerService"
    if ($envLine -match 'SERVER_ID=([^ ]+)') {
        return $matches[1]
    }
    throw "Could not find SERVER_ID in $TmServerService environment: $envLine"
}

function Render-Template {
    param(
        [string]$TemplatePath,
        [string]$ServerId
    )
    $content = Get-Content -Raw $TemplatePath
    return $content.Replace('__REPO_DIR__', $RepoDir).
        Replace('__TM_BASE_URL__', $BaseUrl).
        Replace('__SERVER_ID__', $ServerId)
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templateDir = Join-Path $scriptDir 'systemd'
$autoTemplate = Join-Path $templateDir 'tm-auto-watcher.service.template'
$shadowTemplate = Join-Path $templateDir 'tm-shadow-watch.service.template'

$serverId = Get-RemoteServerId
$autoContent = Render-Template -TemplatePath $autoTemplate -ServerId $serverId
$shadowContent = Render-Template -TemplatePath $shadowTemplate -ServerId $serverId

Write-Host "Discovered tm-server SERVER_ID: $serverId"
Write-Host "Target VPS: $VpsHost"
Write-Host "Watcher repo dir: $RepoDir"
Write-Host "Base URL: $BaseUrl"
Write-Host "Mode: $(if ($DryRun) { 'dry-run' } elseif ($NoRestart) { 'apply without watcher restart' } else { 'apply with watcher restart' })"

if ($DryRun) {
    Write-Host ""
    Write-Host "=== $AutoWatcherService ==="
    Write-Host $autoContent
    Write-Host ""
    Write-Host "=== $ShadowWatcherService ==="
    Write-Host $shadowContent
    exit 0
}

$autoBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($autoContent))
$shadowBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($shadowContent))

$remoteScript = @"
set -euo pipefail
mkdir -p ~/.config/systemd/user
python3 - <<'PY'
import base64
from pathlib import Path

files = {
    Path.home() / ".config/systemd/user/$AutoWatcherService": "$autoBase64",
    Path.home() / ".config/systemd/user/$ShadowWatcherService": "$shadowBase64",
}

for path, payload in files.items():
    path.write_text(base64.b64decode(payload).decode("utf-8"), encoding="utf-8")

dropin_dir = Path.home() / ".config/systemd/user/$AutoWatcherService.d"
dropin_file = dropin_dir / "server-id.conf"
if dropin_file.exists():
    dropin_file.unlink()
if dropin_dir.exists() and not any(dropin_dir.iterdir()):
    dropin_dir.rmdir()
PY
systemctl --user daemon-reload
echo '--- auto-watcher env'
systemctl --user show -p Environment $AutoWatcherService
echo '--- shadow-watch env'
systemctl --user show -p Environment $ShadowWatcherService
"@

if ($NoRestart) {
    $remoteScript += @"

echo '--- auto-watcher unit'
systemctl --user cat $AutoWatcherService
echo '--- shadow-watch unit'
systemctl --user cat $ShadowWatcherService
"@
} else {
    $remoteScript += @"

systemctl --user restart $AutoWatcherService $ShadowWatcherService
echo '--- auto-watcher status'
systemctl --user status $AutoWatcherService --no-pager | sed -n '1,20p'
echo '--- shadow-watch status'
systemctl --user status $ShadowWatcherService --no-pager | sed -n '1,20p'
"@
}

Invoke-Ssh $remoteScript
