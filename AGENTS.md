# AGENTS.md - tm-tierlist

## Live Extension Safety

- `C:\Users\Ruslan\tm\tm-tierlist\extension` is the unpacked browser extension path.
- Keep this worktree on `codex/advisor-live-fixes-20260421` unless the user explicitly asks to move it.
- For PR branches, clean slices, and experiments, create a sibling git worktree instead of switching this worktree away from the live advisor branch.
- Before finishing extension/advisor work, run `npm run --silent extension:check-live-advisor-bundle`.
- If the change touches advisor behavior, also run `npm run --silent test:fast`.
