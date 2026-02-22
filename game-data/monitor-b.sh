#!/bin/bash

# TM Game Monitor — monitors 3 games, logs only changes
# Runs every 60 seconds for up to 60 iterations (1 hour)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/monitor-b.log"
STATE_DIR="$SCRIPT_DIR/.monitor-state"

GAMES=("g984aee0945dc" "gad046f848f34" "g4f2669dac7ff")
GAME_LABELS=("Samesexphone" "death8killer" "Plazmica")

MAX_ITERATIONS=60
SLEEP_SECONDS=60

mkdir -p "$STATE_DIR"

# Initialize ended games tracker
declare -A ENDED_GAMES

log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] $1" | tee -a "$LOG_FILE"
}

log "=== Monitor started. Tracking ${#GAMES[@]} games, $MAX_ITERATIONS iterations ==="

for i in $(seq 1 $MAX_ITERATIONS); do
    active_count=0

    for idx in "${!GAMES[@]}"; do
        gid="${GAMES[$idx]}"
        label="${GAME_LABELS[$idx]}"

        # Skip ended games
        if [[ "${ENDED_GAMES[$gid]}" == "1" ]]; then
            continue
        fi

        active_count=$((active_count + 1))

        # Fetch API
        raw=$(curl -s "https://terraforming-mars.herokuapp.com/api/spectator?id=$gid" 2>/dev/null)

        # Check for errors
        if [[ -z "$raw" || "$raw" == "Not found" || "$raw" == "null" ]]; then
            prev_err="$STATE_DIR/${gid}_error"
            if [[ ! -f "$prev_err" ]]; then
                log "$gid ($label): API returned '$raw' — game may have expired"
                touch "$prev_err"
            fi
            continue
        fi

        # Save latest full snapshot
        echo "$raw" > "$SCRIPT_DIR/${gid}_latest.json"

        # Extract key fields with node
        current=$(echo "$raw" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
    try {
        const d = JSON.parse(Buffer.concat(chunks).toString());
        const out = {
            generation: d.game?.generation,
            phase: d.game?.phase,
            players: (d.players || []).map(p => ({
                name: p.name,
                tr: p.terraformRating,
                lastCard: p.lastCardPlayed || null,
                vp: p.victoryPointsBreakdown?.total || null
            }))
        };
        console.log(JSON.stringify(out));
    } catch(e) {
        console.log(JSON.stringify({error: e.message}));
    }
});
" 2>/dev/null)

        if [[ -z "$current" ]]; then
            continue
        fi

        # Check for parse error
        has_error=$(echo "$current" | node -e "
const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    const j=JSON.parse(Buffer.concat(c).toString());
    console.log(j.error?'yes':'no');
});" 2>/dev/null)

        if [[ "$has_error" == "yes" ]]; then
            continue
        fi

        # Compare with previous state
        prev_file="$STATE_DIR/${gid}_state.json"

        if [[ ! -f "$prev_file" ]]; then
            # First observation — log initial state
            summary=$(echo "$current" | node -e "
const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    const s=JSON.parse(Buffer.concat(c).toString());
    let parts = ['Gen ' + s.generation + ', phase: ' + s.phase];
    s.players.forEach(p => {
        let info = p.name + ' TR ' + p.tr;
        if (p.lastCard) info += ' (last: \"' + p.lastCard + '\")';
        parts.push(info);
    });
    console.log(parts.join(' | '));
});" 2>/dev/null)
            log "$gid ($label): INITIAL STATE | $summary"
            echo "$current" > "$prev_file"
            continue
        fi

        # Diff previous vs current
        prev_content=$(cat "$prev_file")
        changes=$(node -e "
const prev = JSON.parse(process.argv[1]);
const curr = JSON.parse(process.argv[2]);
const gid = process.argv[3];
const label = process.argv[4];

const diffs = [];

// Check generation change
if (prev.generation !== curr.generation) {
    diffs.push('Gen ' + prev.generation + '→' + curr.generation);
}

// Check phase change
if (prev.phase !== curr.phase) {
    diffs.push('phase: ' + prev.phase + '→' + curr.phase);
}

// Check player changes
const prevMap = {};
prev.players.forEach(p => prevMap[p.name] = p);

curr.players.forEach(p => {
    const pp = prevMap[p.name];
    if (!pp) {
        diffs.push(p.name + ' (new player) TR ' + p.tr);
        return;
    }
    if (pp.tr !== p.tr) {
        diffs.push(p.name + ' TR ' + pp.tr + '→' + p.tr);
    }
    if (pp.lastCard !== p.lastCard && p.lastCard) {
        diffs.push(p.name + ' played \"' + p.lastCard + '\"');
    }
});

// Check for game end
if (curr.phase === 'end' && prev.phase !== 'end') {
    let winner = curr.players.reduce((a,b) => (b.vp||0) > (a.vp||0) ? b : a);
    let winInfo = 'GAME ENDED | Winner: ' + winner.name + ' (TR ' + winner.tr;
    if (winner.vp) winInfo += ', VP ' + winner.vp;
    winInfo += ')';
    diffs.unshift(winInfo);
}

if (diffs.length > 0) {
    console.log('CHANGED|' + diffs.join(' | '));
} else {
    console.log('NOCHANGE');
}
" "$prev_content" "$current" "$gid" "$label" 2>/dev/null)

        if [[ "$changes" == CHANGED* ]]; then
            detail="${changes#CHANGED|}"
            log "$gid ($label): $detail"
            echo "$current" > "$prev_file"

            # Mark ended
            phase=$(echo "$current" | node -e "
const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    console.log(JSON.parse(Buffer.concat(c).toString()).phase);
});" 2>/dev/null)
            if [[ "$phase" == "end" ]]; then
                ENDED_GAMES[$gid]="1"
                log "$gid ($label): Removed from monitoring (game ended)"
            fi
        fi
        # If NOCHANGE — do nothing (log only changes)

    done

    # Check if all games ended or errored
    if [[ $active_count -eq 0 ]]; then
        log "=== All games ended or unavailable. Stopping monitor. ==="
        exit 0
    fi

    # Don't sleep on last iteration
    if [[ $i -lt $MAX_ITERATIONS ]]; then
        sleep $SLEEP_SECONDS
    fi
done

log "=== Monitor finished after $MAX_ITERATIONS iterations ==="
