<#
.SYNOPSIS
    Логгер партий Terraforming Mars — поллит API и записывает изменения.

.DESCRIPTION
    Принимает game ID, сам достаёт player IDs, каждые N секунд дёргает API
    и фиксирует дельту: смена фазы, generation, глобалки, ресурсы, действия,
    сыгранные карты.

.EXAMPLE
    .\tm-game-logger.ps1 -GameId gb5e67b20401
    .\tm-game-logger.ps1 -GameId gb5e67b20401 -Interval 15 -LogDir ~/Desktop/Марс/logs
#>

param(
    [Parameter(Mandatory)]
    [string]$GameId,

    [int]$Interval = 30,

    [string]$LogDir = "$PSScriptRoot\logs"
)

$ErrorActionPreference = 'Stop'
$BaseUrl = "https://terraforming-mars.herokuapp.com/api"

# --- Helpers ---

function Get-Timestamp { Get-Date -Format "HH:mm:ss" }

function Write-Log {
    param([string]$Msg, [string]$Color = "White")
    $ts = Get-Timestamp
    $line = "[$ts] $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Write-JsonEvent {
    param([hashtable]$Event)
    $Event["ts"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $json = $Event | ConvertTo-Json -Depth 10 -Compress
    Add-Content -Path $JsonFile -Value $json -Encoding UTF8
}

function Fetch-Json {
    param([string]$Url)
    try {
        Invoke-RestMethod -Uri $Url -TimeoutSec 15
    } catch {
        $null
    }
}

function Format-Resources {
    param($p)
    $mc = "$($p.megaCredits)($($p.megaCreditProduction))"
    $st = "$($p.steel)($($p.steelProduction))"
    $ti = "$($p.titanium)($($p.titaniumProduction))"
    $pl = "$($p.plants)($($p.plantProduction))"
    $en = "$($p.energy)($($p.energyProduction))"
    $ht = "$($p.heat)($($p.heatProduction))"
    "MC:$mc St:$st Ti:$ti Pl:$pl En:$en Ht:$ht"
}

function Get-PlayerSnapshot {
    param($raw)
    # API structure: $raw.thisPlayer = player stats, $raw.game = game state,
    # $raw.cardsInHand = hand cards (only for queried player),
    # $raw.thisPlayer.tableau = played cards array
    $p = $raw.thisPlayer
    $g = $raw.game

    $tableauNames = @()
    if ($p.tableau) {
        $tableauNames = @($p.tableau | ForEach-Object { $_.name } | Sort-Object)
    }

    $handNames = @()
    if ($raw.cardsInHand) {
        $handNames = @($raw.cardsInHand | ForEach-Object { $_.name } | Sort-Object)
    }

    # Draft state
    $draftOptions = @()
    $waitingForType = ""
    $initialDraftData = $null

    if ($raw.waitingFor) {
        $wf = $raw.waitingFor
        $waitingForType = [string]($wf.input_type ?? $wf.inputType ?? "")

        # Regular draft/research: cards at top level
        if ($wf.cards) {
            $draftOptions = @($wf.cards | ForEach-Object { $_.name } | Sort-Object)
        }

        # Initial draft: nested options (corps, preludes, CEO, cards to buy)
        if ($wf.options -and $waitingForType -in @("initialCards", "or")) {
            $initialDraftData = @{}
            foreach ($opt in $wf.options) {
                $optTitle = [string]($opt.title ?? "")
                $optCards = @()
                if ($opt.cards) {
                    $optCards = @($opt.cards | ForEach-Object { $_.name })
                }
                if ($optTitle -match "corporation") {
                    $initialDraftData["corps"] = $optCards
                } elseif ($optTitle -match "[Pp]relude") {
                    $initialDraftData["preludes"] = $optCards
                } elseif ($optTitle -match "CEO") {
                    $initialDraftData["ceos"] = $optCards
                } elseif ($optTitle -match "cards to buy|initial cards") {
                    $initialDraftData["cards"] = $optCards
                }
            }
            # Only keep if we found at least corps or cards
            if ($initialDraftData.Count -eq 0) { $initialDraftData = $null }
        }

        # Drafting phase: options with nested cards
        if ($wf.options -and $draftOptions.Count -eq 0) {
            foreach ($opt in $wf.options) {
                if ($opt.cards -and $opt.cards.Count -gt 0) {
                    $draftOptions = @($opt.cards | ForEach-Object { $_.name } | Sort-Object)
                    break
                }
            }
        }
    }

    $draftedCards = @()
    if ($raw.draftedCards) {
        $draftedCards = @($raw.draftedCards | ForEach-Object { $_.name } | Sort-Object)
    }

    $vpTotal = 0
    if ($p.victoryPointsBreakdown -and $null -ne $p.victoryPointsBreakdown.total) {
        $vpTotal = [int]$p.victoryPointsBreakdown.total
    }

    @{
        Name              = [string]($p.name ?? "?")
        Color             = [string]($p.color ?? "?")
        TR                = [int]($p.terraformRating ?? 0)
        MC                = [int]($p.megaCredits ?? 0)
        MCProd            = [int]($p.megaCreditProduction ?? 0)
        Steel             = [int]($p.steel ?? 0)
        SteelProd         = [int]($p.steelProduction ?? 0)
        Titanium          = [int]($p.titanium ?? 0)
        TitaniumProd      = [int]($p.titaniumProduction ?? 0)
        Plants            = [int]($p.plants ?? 0)
        PlantProd         = [int]($p.plantProduction ?? 0)
        Energy            = [int]($p.energy ?? 0)
        EnergyProd        = [int]($p.energyProduction ?? 0)
        Heat              = [int]($p.heat ?? 0)
        HeatProd          = [int]($p.heatProduction ?? 0)
        CardsInHand       = [int]($p.cardsInHandNbr ?? 0)
        TableauSize       = $tableauNames.Count
        ActionsThisGame   = [int]($p.actionsTakenThisGame ?? 0)
        ActionsThisRound  = [int]($p.actionsTakenThisRound ?? 0)
        Cities            = [int]($p.citiesCount ?? 0)
        Colonies          = [int]($p.coloniesCount ?? 0)
        VP                = $vpTotal
        Generation        = [int]($g.generation ?? 0)
        Phase             = [string]($g.phase ?? "")
        Temp              = [int]($g.temperature ?? 0)
        Oxygen            = [int]($g.oxygenLevel ?? 0)
        Oceans            = [int]($g.oceans ?? 0)
        Venus             = [int]($g.venusScaleLevel ?? 0)
        Step              = [int]($g.step ?? 0)
        TableauCards      = $tableauNames
        HandCards         = $handNames
        DraftOptions      = $draftOptions
        DraftedCards      = $draftedCards
        WaitingForType    = $waitingForType
        InitialDraftData  = $initialDraftData
    }
}

function Compare-Snapshots {
    param($Old, $New, $PlayerName)
    $changes = @()

    # Ресурсы и production
    $resFields = @(
        @{K="TR"; F="TR"},
        @{K="MC"; F="MC"}, @{K="MC prod"; F="MCProd"},
        @{K="Steel"; F="Steel"}, @{K="Steel prod"; F="SteelProd"},
        @{K="Ti"; F="Titanium"}, @{K="Ti prod"; F="TitaniumProd"},
        @{K="Plants"; F="Plants"}, @{K="Plant prod"; F="PlantProd"},
        @{K="Energy"; F="Energy"}, @{K="Energy prod"; F="EnergyProd"},
        @{K="Heat"; F="Heat"}, @{K="Heat prod"; F="HeatProd"},
        @{K="Cards"; F="CardsInHand"}, @{K="Tableau"; F="TableauSize"},
        @{K="Actions(game)"; F="ActionsThisGame"},
        @{K="Actions(round)"; F="ActionsThisRound"},
        @{K="Cities"; F="Cities"}, @{K="Colonies"; F="Colonies"},
        @{K="VP"; F="VP"}
    )

    foreach ($rf in $resFields) {
        $oldVal = $Old[$rf.F]
        $newVal = $New[$rf.F]
        if ($oldVal -ne $newVal) {
            $delta = $newVal - $oldVal
            $sign = if ($delta -gt 0) { "+" } else { "" }
            $changes += "$($rf.K): $oldVal -> $newVal ($sign$delta)"
        }
    }

    # Новые карты в tableau
    if ($Old.TableauCards -and $New.TableauCards) {
        $newCards = $New.TableauCards | Where-Object { $_ -notin $Old.TableauCards }
        if ($newCards) {
            $changes += "NEW CARDS PLAYED: $($newCards -join ', ')"
        }
    }

    # Изменения на руке
    if ($Old.HandCards -and $New.HandCards) {
        $gone = $Old.HandCards | Where-Object { $_ -notin $New.HandCards }
        $added = $New.HandCards | Where-Object { $_ -notin $Old.HandCards }
        if ($gone) { $changes += "CARDS GONE from hand: $($gone -join ', ')" }
        if ($added) { $changes += "CARDS ADDED to hand: $($added -join ', ')" }
    }

    # Draft tracking
    $oldDraftKey = ($Old.DraftOptions -join ',')
    $newDraftKey = ($New.DraftOptions -join ',')
    if ($newDraftKey -ne $oldDraftKey) {
        if ($New.DraftOptions.Count -gt 0) {
            $changes += "DRAFT OPTIONS: $($New.DraftOptions -join ', ')"
        } elseif ($Old.DraftOptions.Count -gt 0) {
            $changes += "DRAFT DONE"
        }
    }

    # Picked cards (draftedCards grew)
    if ($Old.DraftedCards -or $New.DraftedCards) {
        $newPicks = @($New.DraftedCards | Where-Object { $_ -notin $Old.DraftedCards })
        if ($newPicks.Count -gt 0) {
            $changes += "DRAFTED: $($newPicks -join ', ')"
        }
    }

    $changes
}

# --- Init ---

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogDir "tm_${GameId}_${timestamp}.log"
$JsonFile = Join-Path $LogDir "tm_${GameId}_${timestamp}.jsonl"

Write-Host "`n=== TM Game Logger ===" -ForegroundColor Cyan
Write-Host "Game: $GameId | Interval: ${Interval}s" -ForegroundColor Cyan
Write-Host "Log:  $LogFile" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor Yellow

# Fetch game info and player IDs
Write-Host "Fetching game info..." -ForegroundColor DarkGray
$gameInfo = Fetch-Json "$BaseUrl/game?id=$GameId"
if (-not $gameInfo) {
    Write-Host "ERROR: Could not fetch game $GameId" -ForegroundColor Red
    exit 1
}

$players = @()
foreach ($p in $gameInfo.players) {
    $players += @{ Id = $p.id; Name = $p.name; Color = $p.color }
}

$spectatorId = $gameInfo.spectatorId

Write-Log "Game $GameId on $($gameInfo.gameOptions.boardName)" Cyan
Write-Log "Players: $(($players | ForEach-Object { "$($_.Name)($($_.Color))" }) -join ', ')" Cyan
Write-Log "Spectator: $spectatorId" DarkGray
Write-Log ("=" * 60) DarkGray

# --- State ---
$prevSnapshots = @{}
$prevGlobals = $null
$pollCount = 0
$currentPhase = ""
$initialDraftLogged = @{} # track which players' initial draft we already logged

# --- Main loop ---
while ($true) {
    $pollCount++
    $anyChange = $false
    foreach ($pl in $players) {
        $raw = Fetch-Json "$BaseUrl/player?id=$($pl.Id)"
        if (-not $raw) {
            Write-Log "$($pl.Name): fetch failed" Red
            continue
        }

        $snap = Get-PlayerSnapshot $raw

        # Global params (берём из первого успешного ответа)
        if (-not $prevGlobals -and $pollCount -eq 1) {
            Write-Log "Gen $($snap.Generation) | Phase: $($snap.Phase) | Temp:$($snap.Temp) O2:$($snap.Oxygen) Oceans:$($snap.Oceans) Venus:$($snap.Venus)" Green
        }

        # Проверяем глобалки
        if ($prevGlobals) {
            $gChanges = @()
            if ($snap.Generation -ne $prevGlobals.Generation) { $gChanges += "GEN $($prevGlobals.Generation) -> $($snap.Generation)" }
            if ($snap.Phase -ne $prevGlobals.Phase) { $gChanges += "Phase: $($prevGlobals.Phase) -> $($snap.Phase)" }
            if ($snap.Temp -ne $prevGlobals.Temp) { $gChanges += "Temp: $($prevGlobals.Temp) -> $($snap.Temp)" }
            if ($snap.Oxygen -ne $prevGlobals.Oxygen) { $gChanges += "O2: $($prevGlobals.Oxygen) -> $($snap.Oxygen)" }
            if ($snap.Oceans -ne $prevGlobals.Oceans) { $gChanges += "Oceans: $($prevGlobals.Oceans) -> $($snap.Oceans)" }
            if ($snap.Venus -ne $prevGlobals.Venus) { $gChanges += "Venus: $($prevGlobals.Venus) -> $($snap.Venus)" }
            if ($gChanges) {
                Write-Log "--- GLOBALS: $($gChanges -join ' | ') ---" Magenta
                $anyChange = $true
            }
        }
        $prevGlobals = @{
            Generation = $snap.Generation; Phase = $snap.Phase
            Temp = $snap.Temp; Oxygen = $snap.Oxygen
            Oceans = $snap.Oceans; Venus = $snap.Venus
        }

        # Сравниваем snapshot
        $prevKey = $pl.Id
        if ($prevSnapshots.ContainsKey($prevKey)) {
            $changes = Compare-Snapshots $prevSnapshots[$prevKey] $snap $pl.Name
            if ($changes) {
                $anyChange = $true
                Write-Log "$($pl.Name):" Yellow
                foreach ($c in $changes) {
                    Write-Log "  $c" White
                }
            }
        } else {
            # Первый poll — выводим полное состояние
            Write-Log "$($pl.Name) ($($pl.Color)) — TR:$($snap.TR) VP:$($snap.VP) Tableau:$($snap.TableauSize) Hand:$($snap.CardsInHand)" Yellow
            $resLine = "  MC:$($snap.MC)($($snap.MCProd)) St:$($snap.Steel)($($snap.SteelProd)) Ti:$($snap.Titanium)($($snap.TitaniumProd)) Pl:$($snap.Plants)($($snap.PlantProd)) En:$($snap.Energy)($($snap.EnergyProd)) Ht:$($snap.Heat)($($snap.HeatProd))"
            Write-Log $resLine Gray
            if ($snap.DraftOptions.Count -gt 0) {
                Write-Log "  DRAFT OPTIONS: $($snap.DraftOptions -join ', ')" DarkCyan
            }
            if ($snap.DraftedCards.Count -gt 0) {
                Write-Log "  ALREADY DRAFTED: $($snap.DraftedCards -join ', ')" DarkCyan
            }
        }

        # --- JSONL Draft Events ---
        if ($prevSnapshots.ContainsKey($prevKey)) {
            $prev = $prevSnapshots[$prevKey]

            # Initial draft options (first time for this player)
            if ($snap.InitialDraftData -and -not $initialDraftLogged[$pl.Id]) {
                Write-JsonEvent @{
                    type     = "initial_draft_options"
                    gen      = $snap.Generation
                    phase    = $snap.Phase
                    player   = $pl.Name
                    color    = $pl.Color
                    corps    = $snap.InitialDraftData["corps"]
                    preludes = $snap.InitialDraftData["preludes"]
                    ceos     = $snap.InitialDraftData["ceos"]
                    cards    = $snap.InitialDraftData["cards"]
                }
                Write-Log "  >> INITIAL DRAFT: corps=$($snap.InitialDraftData['corps'] -join ', ')" DarkCyan
                $initialDraftLogged[$pl.Id] = $true
            }

            # Draft pick detection (draft options changed) — only in draft phases
            $draftPhases = @("initial_drafting", "drafting")
            $oldDraftKey = ($prev.DraftOptions -join ',')
            $newDraftKey = ($snap.DraftOptions -join ',')
            if ($oldDraftKey -ne $newDraftKey -and $prev.DraftOptions.Count -gt 0 -and $snap.Phase -in $draftPhases) {
                $newlyDrafted = @($snap.DraftedCards | Where-Object { $_ -notin $prev.DraftedCards })
                $passed = @($prev.DraftOptions | Where-Object { $_ -notin $newlyDrafted })

                Write-JsonEvent @{
                    type          = "draft_pick"
                    gen           = $snap.Generation
                    phase         = $snap.Phase
                    player        = $pl.Name
                    color         = $pl.Color
                    from_pack     = $prev.DraftOptions
                    picked        = $newlyDrafted
                    passed        = $passed
                    new_pack      = $snap.DraftOptions
                    drafted_total = $snap.DraftedCards
                }
                if ($newlyDrafted.Count -gt 0) {
                    Write-Log "  >> DRAFT PICK: $($newlyDrafted -join ', ') from [$($prev.DraftOptions -join ', ')]" DarkCyan
                }
            }

            # New draft options appeared (received new pack from neighbor) — only in draft phases
            if ($newDraftKey -ne $oldDraftKey -and $snap.DraftOptions.Count -gt 0 -and $prev.DraftOptions.Count -eq 0 -and $snap.Phase -in $draftPhases) {
                Write-JsonEvent @{
                    type          = "draft_received"
                    gen           = $snap.Generation
                    phase         = $snap.Phase
                    player        = $pl.Name
                    color         = $pl.Color
                    new_pack      = $snap.DraftOptions
                    drafted_total = $snap.DraftedCards
                }
                Write-Log "  >> DRAFT RECEIVED: [$($snap.DraftOptions -join ', ')]" DarkCyan
            }

            # Detect corp/prelude/CEO selection (tableau grew in research/preludes phase)
            if ($snap.Phase -in @("research", "preludes", "ceos") -or ($prev.Phase -in @("research", "preludes", "ceos"))) {
                $newTableau = @($snap.TableauCards | Where-Object { $_ -notin $prev.TableauCards })
                if ($newTableau.Count -gt 0) {
                    foreach ($card in $newTableau) {
                        # Determine type by context
                        $cardType = "card_played"
                        if ($snap.Phase -eq "preludes" -or $prev.Phase -eq "preludes") { $cardType = "prelude_played" }
                        if ($snap.TableauSize -eq 1 -and $prev.TableauSize -eq 0) { $cardType = "corp_selected" }
                        # CEO detection: check if the card was in CEO draft
                        # Simple heuristic: single-word name + tableau grew by 1 during ceos/preludes→action
                        Write-JsonEvent @{
                            type   = $cardType
                            gen    = $snap.Generation
                            phase  = $snap.Phase
                            player = $pl.Name
                            color  = $pl.Color
                            card   = $card
                        }
                    }
                }
            }

            # Research phase transitions
            if ($prev.Phase -eq "research" -and $snap.Phase -ne "research") {
                $boughtCards = @($snap.HandCards | Where-Object { $_ -notin $prev.HandCards })
                $soldCards = @($prev.DraftedCards | Where-Object { $_ -notin $snap.DraftedCards -and $_ -notin $boughtCards })
                Write-JsonEvent @{
                    type      = "research_complete"
                    gen       = $snap.Generation
                    player    = $pl.Name
                    color     = $pl.Color
                    drafted   = $prev.DraftedCards
                    bought    = $boughtCards
                    skipped   = $soldCards
                    hand_size = $snap.CardsInHand
                }
                if ($boughtCards.Count -gt 0) {
                    Write-Log "  >> BOUGHT: $($boughtCards -join ', ')" DarkCyan
                }
            }

            # Phase change event
            if ($prev.Phase -ne $snap.Phase) {
                Write-JsonEvent @{
                    type      = "phase_change"
                    gen       = $snap.Generation
                    player    = $pl.Name
                    from      = $prev.Phase
                    to        = $snap.Phase
                }
            }
        } else {
            # First snapshot for this player — emit initial state
            Write-JsonEvent @{
                type         = "player_init"
                gen          = $snap.Generation
                phase        = $snap.Phase
                player       = $pl.Name
                color        = $pl.Color
                tr           = $snap.TR
                mc           = $snap.MC
                tableau      = $snap.TableauCards
                hand         = $snap.HandCards
                draft_opts   = $snap.DraftOptions
                drafted      = $snap.DraftedCards
            }
            # Log initial draft if present on first poll
            if ($snap.InitialDraftData -and -not $initialDraftLogged[$pl.Id]) {
                Write-JsonEvent @{
                    type     = "initial_draft_options"
                    gen      = $snap.Generation
                    phase    = $snap.Phase
                    player   = $pl.Name
                    color    = $pl.Color
                    corps    = $snap.InitialDraftData["corps"]
                    preludes = $snap.InitialDraftData["preludes"]
                    ceos     = $snap.InitialDraftData["ceos"]
                    cards    = $snap.InitialDraftData["cards"]
                }
                $initialDraftLogged[$pl.Id] = $true
            }
        }

        $prevSnapshots[$prevKey] = $snap
    }

    # Track current phase for adaptive polling
    if ($prevGlobals) { $currentPhase = $prevGlobals.Phase }

    # Проверяем конец игры
    if ($prevGlobals.Phase -eq "end") {
        Write-Log "=== GAME OVER ===" Red
        foreach ($pl in $players) {
            $s = $prevSnapshots[$pl.Id]
            if ($s) {
                Write-Log "$($pl.Name): $($s.VP) VP (TR:$($s.TR))" Cyan
            }
        }
        break
    }

    if (-not $anyChange -and $pollCount -gt 1) {
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }

    # Adaptive polling: fast during draft/research, normal during action
    $fastPhases = @("drafting", "initial_drafting", "research", "preludes", "ceos")
    $sleepSec = if ($currentPhase -in $fastPhases) { 3 } else { $Interval }
    Start-Sleep -Seconds $sleepSec
}

Write-Host "`nDone. Log saved to:" -ForegroundColor Green
Write-Host "  $LogFile" -ForegroundColor Gray
