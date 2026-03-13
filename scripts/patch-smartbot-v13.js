/**
 * patch-smartbot-v13.js — Milestone proximity awareness
 *
 * Fix 45: Milestone proximity bonus in card buying — cards that advance milestone progress
 *         get bonus EV proportional to how close we are to claiming
 * Fix 46: Milestone-aware action priority — when 1 action away from milestone,
 *         prioritize that action (greenery for Gardener, city SP for Mayor)
 * Fix 47: Smart milestone choice — when multiple milestones claimable, pick best one
 *         (prefer ones opponents can't easily contest)
 */
const fs = require('fs');
const file = process.argv[2] || '/home/openclaw/terraforming-mars/smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(label, old, neu) {
  if (code.includes(old)) {
    code = code.replace(old, neu);
    changes++;
    console.log('OK: ' + label);
  } else {
    console.log('SKIP: ' + label + ' (pattern not found)');
  }
}

// Fix 45: Milestone proximity bonus in card buying
// After corp synergy bonus in the buy sort function, add milestone proximity scoring.
// Cards with building/earth/jovian/science/microbe/animal/plant/event tags get bonus
// when bot is close to a milestone requiring those tags.
replace('milestone proximity in buy',
  `        return sb - sa;
      });
      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 4);`,
  `        // Milestone proximity: bonus for cards advancing unclaimed milestones
        const claimed = state?.game?.milestones?.filter(m => m.playerName) || [];
        const claimedCount = claimed.length;
        if (claimedCount < 3) {
          const milestones = state?.game?.milestones || [];
          const myColor = state?.thisPlayer?.color;
          for (const ms of milestones) {
            if (ms.playerName) continue; // already claimed
            const myScore = ms.scores?.find(s => s.color === myColor);
            if (!myScore) continue;
            const sc = myScore.score ?? 0;
            const mName = (ms.name || '').toLowerCase();
            // Builder: 8 building tags → bonus for building-tagged cards
            if (mName.includes('builder') && sc >= 5) {
              const need = 8 - sc;
              const bonus = need <= 2 ? 6 : (need <= 3 ? 3 : 0);
              if ((CARD_TAGS[a.name]||[]).includes('building')) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).includes('building')) sb += bonus;
            }
            // Gardener: 3 greeneries → bonus for plant production cards
            if (mName.includes('gardener') && sc >= 1) {
              const aData2 = CARD_DATA[a.name]||{}, bData2 = CARD_DATA[b.name]||{};
              if (aData2.behavior?.production?.plants > 0) sa += 4;
              if (bData2.behavior?.production?.plants > 0) sb += 4;
            }
            // Diversifier: 8 different tags → bonus for rare tags we don't have
            if (mName.includes('diversifier') && sc >= 5) {
              const need = 8 - sc;
              const bonus = need <= 2 ? 5 : (need <= 3 ? 3 : 0);
              const aTags2 = CARD_TAGS[a.name]||[], bTags2 = CARD_TAGS[b.name]||[];
              if (aTags2.some(t => !(myTags[t] > 0))) sa += bonus;
              if (bTags2.some(t => !(myTags[t] > 0))) sb += bonus;
            }
            // Ecologist: 4 bio tags (plant+animal+microbe)
            if (mName.includes('ecologist') && sc >= 2) {
              const need = 4 - sc;
              const bonus = need <= 2 ? 5 : (need <= 3 ? 3 : 0);
              const bioTags = ['plant','animal','microbe'];
              if ((CARD_TAGS[a.name]||[]).some(t => bioTags.includes(t))) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).some(t => bioTags.includes(t))) sb += bonus;
            }
            // Rim Settler: 3 Jovian tags
            if (mName.includes('rim') && sc >= 1) {
              const need = 3 - sc;
              const bonus = need <= 1 ? 6 : (need <= 2 ? 3 : 0);
              if ((CARD_TAGS[a.name]||[]).includes('jovian')) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).includes('jovian')) sb += bonus;
            }
            // Tycoon: 15 project cards → bonus for cheap playable cards
            if (mName.includes('tycoon') && sc >= 10) {
              const need = 15 - sc;
              const bonus = need <= 3 ? 4 : (need <= 5 ? 2 : 0);
              if ((a.cost || 99) <= 15) sa += bonus;
              if ((b.cost || 99) <= 15) sb += bonus;
            }
            // Legend: 5 events → bonus for event cards
            if (mName.includes('legend') && sc >= 3) {
              const need = 5 - sc;
              const bonus = need <= 2 ? 5 : 0;
              if ((CARD_TAGS[a.name]||[]).includes('event')) sa += bonus;
              if ((CARD_TAGS[b.name]||[]).includes('event')) sb += bonus;
            }
          }
        }
        return sb - sa;
      });
      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 4);`
);

// Fix 46: Milestone-aware greenery/city priority
// When 1 greenery away from Gardener milestone, place greenery before SP
// When 1-2 cities away from Mayor, prioritize city SP
replace('milestone greenery priority',
  `    // Milestones: best ROI in game (8 MC = 5 VP), claim ASAP — even gen 1
    if (milestoneIdx >= 0 && mc >= 8) return pick(milestoneIdx);`,
  `    // Milestones: best ROI in game (8 MC = 5 VP), claim ASAP — even gen 1
    if (milestoneIdx >= 0 && mc >= 8) return pick(milestoneIdx);

    // Milestone pursuit: when close to a milestone, prioritize enabling actions
    const claimedMilestones = state?.game?.milestones?.filter(m => m.playerName) || [];
    if (claimedMilestones.length < 3) {
      const allMilestones = state?.game?.milestones || [];
      const myColor = state?.thisPlayer?.color;
      for (const ms of allMilestones) {
        if (ms.playerName) continue;
        const myScore = ms.scores?.find(s => s.color === myColor);
        if (!myScore || !myScore.claimable) continue; // not yet at threshold
        // We CAN claim this milestone but haven't yet — will be caught by milestoneIdx above
        // (milestoneIdx should be >= 0 already, so this is just a safety net)
      }
      // Near-milestone actions:
      for (const ms of allMilestones) {
        if (ms.playerName) continue;
        const myScore = ms.scores?.find(s => s.color === myColor);
        if (!myScore) continue;
        const sc = myScore.score ?? 0;
        const mName = (ms.name || '').toLowerCase();
        // Gardener: need 3 greeneries, at 2 → place greenery NOW (5 VP for 23 MC = amazing)
        if (mName.includes('gardener') && sc === 2 && greeneryIdx >= 0 && plants >= 8) {
          console.log('    → milestone pursuit: greenery for Gardener (2/3)');
          return pick(greeneryIdx);
        }
        // Mayor: need 3 cities, at 2 → city SP priority boost (handled in SP selection)
        // Terraformer: need 35 TR → just play normally, TR comes from everything
      }
    }`
);

// Fix 47: Smart milestone choice — when picking which milestone to claim,
// prefer the one where we have the biggest lead over opponents
// This is triggered when the server shows "Select a milestone to claim" sub-menu
replace('smart milestone choice',
  `    // Award selection: pick the award where we lead the most (using calculated metrics)
    if (orTitle.includes('fund an award') || orTitle.includes('fund -')) {`,
  `    // Milestone selection: pick the milestone where we have the biggest lead
    if (orTitle.includes('milestone') && !orTitle.includes('fund')) {
      const msOpts = titles.filter(x => !x.t.includes('don') && !x.t.includes('pass'));
      if (msOpts.length > 1) {
        // If multiple milestones available, pick one with best lead
        // (we qualify for all shown, but some opponents might be close too)
        const milestones = state?.game?.milestones || [];
        const myColor = state?.thisPlayer?.color;
        let bestMsIdx = msOpts[0]?.i ?? 0, bestMsLead = -999;
        for (const mo of msOpts) {
          const msData = milestones.find(m => mo.t.includes(m.name?.toLowerCase?.()));
          if (!msData) continue;
          const myS = msData.scores?.find(s => s.color === myColor)?.score ?? 0;
          const maxOther = Math.max(0, ...(msData.scores || []).filter(s => s.color !== myColor).map(s => s.score ?? 0));
          const lead = myS - maxOther;
          if (lead > bestMsLead) { bestMsLead = lead; bestMsIdx = mo.i; }
        }
        console.log('    → milestone pick: ' + (titles[bestMsIdx]?.t || '?') + ' (lead=' + bestMsLead + ')');
        return pick(bestMsIdx);
      }
      // Single milestone — just claim it
      if (msOpts.length === 1) return pick(msOpts[0].i);
      return pick(0);
    }

    // Award selection: pick the award where we lead the most (using calculated metrics)
    if (orTitle.includes('fund an award') || orTitle.includes('fund -')) {`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
