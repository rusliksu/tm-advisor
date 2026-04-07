param(
    [int]$Count = 10,
    [string]$Server = "https://tm.knightbyte.win",
    [string]$VpsAlias = "vps",
    [string]$DbPath = "/home/openclaw/terraforming-mars/db/game.db"
)

$ErrorActionPreference = "Stop"

$query = @"
select game_id
from completed_game
where game_id like 'g%'
order by completed_time desc
limit $Count;
"@

$sshCommand = "sqlite3 -noheader $DbPath ""$query"""
$raw = & ssh $VpsAlias $sshCommand

$gameIds = $raw |
    Where-Object { $_ -and $_.Trim() } |
    ForEach-Object { $_.Trim() }

if (-not $gameIds -or $gameIds.Count -eq 0) {
    throw "Не удалось получить завершённые gameId с VPS"
}

Write-Host "Fetched $($gameIds.Count) finished game ids from $VpsAlias"
Write-Host ($gameIds -join ", ")

$fetchArgs = @(
    "C:\Users\Ruslan\tm\tm-tierlist\scripts\fetch-game.js",
    "--server", $Server
) + $gameIds

& node @fetchArgs

$missing = @()
foreach ($gid in $gameIds) {
    $path1 = Join-Path "C:\Users\Ruslan\tm\tm-tierlist\data\game_logs" ("tm-fetch-{0}-*.json" -f $gid)
    $exists = Get-ChildItem $path1 -ErrorAction SilentlyContinue
    if (-not $exists) {
        $missing += $gid
    }
}

if ($missing.Count -gt 0) {
    Write-Host "API skipped $($missing.Count) game(s), trying DB fallback..."
    $dbArgs = @(
        "C:\Users\Ruslan\tm\tm-tierlist\scripts\fetch-game-from-db.js",
        "--vps", $VpsAlias
    ) + $missing
    & node @dbArgs
}

$invalid = Get-ChildItem "C:\Users\Ruslan\tm\tm-tierlist\data\game_logs\tm-db-result-*.json" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First ($Count * 2) |
    ForEach-Object {
        $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
        if ($json.validScores -eq $false) { $_.Name }
    }

if ($invalid) {
    Write-Host "Invalid DB score exports detected:"
    $invalid | ForEach-Object { Write-Host "  $_" }
}
