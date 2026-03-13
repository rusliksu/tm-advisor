/**
 * patch-smartbot-v9.js — DEPRECATED
 *
 * Tested: avg VP dropped from 56.9 → 55.5 (v9b) / 54.8 (v9c)
 *
 * Fix 25: Full award coverage — added metrics but bots fund bad awards → -VP
 * Fix 26: Trade threshold 5 (from 8) — bots trade instead of SP/cards → -VP
 * Fix 27: SP fallback steps > 5 — caused infinite loops, reverted to > 3
 * Fix 28: Heat guard when temp maxed — edge case, minimal impact
 *
 * CONCLUSION: All fixes hurt performance. DO NOT APPLY.
 * v8 remains the best version. v10 builds on v8.
 */
// This file intentionally left as documentation only.
console.log('v9 is DEPRECATED — do not apply. Use v8 + v10 instead.');
