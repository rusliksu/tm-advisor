// TM Tier Overlay — Content Script v2.0
// Full feature set: badges, tooltips, combos, dimming, draft summary, corp synergy,
// search, M/A advisor, recommendations, opponent intel, hand sort, toasts,
// dynamic value calc, milestone race, card comparison, income projection,
// card pool tracker, play order advisor, tag counter, draft filter,
// generation timer, VP tracker, global parameters HUD,
// panel persistence, buying power, standard projects, settings import/export

(function () {
  'use strict';

  let enabled = true;
  let showRu = false;

  // Safe chrome.storage wrapper — prevents "Extension context invalidated" errors
  function safeStorage(fn) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
        fn(chrome.storage);
      }
    } catch (e) { /* extension context invalidated */ }
  }
  let tierFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

  // Panel state keys for persistence
  const PANEL_DEFAULTS = {
    enabled: true, tierFilter: tierFilter,
    panel_advisor: false, panel_opp: false, panel_income: false,
    panel_pool: false, panel_playorder: false, panel_tags: false,
    panel_vp: false, panel_globals: false,
    panel_playable: false, panel_turmoil: false,
  };

  function savePanelState() {
    safeStorage((s) => s.local.set({
      panel_advisor: advisorVisible, panel_opp: oppTrackerVisible,
      panel_income: incomeVisible, panel_pool: poolVisible,
      panel_playorder: playOrderVisible, panel_tags: tagCounterVisible,
      panel_vp: vpVisible, panel_globals: globalsVisible,
      panel_playable: playableVisible, panel_turmoil: turmoilVisible,
    }));
  }

  // Load settings
  safeStorage((s) => {
    s.local.get(PANEL_DEFAULTS, (r) => {
      enabled = r.enabled;
      tierFilter = r.tierFilter;
      // Restore panel states
      advisorVisible = r.panel_advisor;
      oppTrackerVisible = r.panel_opp;
      incomeVisible = r.panel_income;
      poolVisible = r.panel_pool;
      playOrderVisible = r.panel_playorder;
      tagCounterVisible = r.panel_tags;
      vpVisible = r.panel_vp;
      globalsVisible = r.panel_globals;
      playableVisible = r.panel_playable;
      turmoilVisible = r.panel_turmoil;
      loadSeenCards();
      if (enabled) processAll();
    });

    s.onChanged.addListener((changes) => {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
        enabled ? processAll() : removeAll();
      }
      if (changes.tierFilter) {
        tierFilter = changes.tierFilter.newValue;
        reapplyFilter();
      }
    });
  });

  // Kebab lookup: "arctic-algae" → "Arctic Algae"
  const kebabLookup = {};
  for (const name in TM_RATINGS) {
    kebabLookup[name.toLowerCase().replace(/ /g, '-')] = name;
  }

  // Russian display name: always prefer Russian, fallback to English
  function ruName(engName) {
    if (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[engName]) {
      return TM_NAMES_RU[engName];
    }
    return engName;
  }

  // Combo rating colors
  const COMBO_COLORS = {
    godmode: { bg: 'rgba(231,76,60,0.92)', border: '#e74c3c' },
    great:   { bg: 'rgba(243,156,18,0.92)', border: '#f39c12' },
    good:    { bg: 'rgba(46,204,113,0.92)', border: '#2ecc71' },
    decent:  { bg: 'rgba(52,152,219,0.92)', border: '#3498db' },
    niche:   { bg: 'rgba(149,165,166,0.85)', border: '#95a5a6' },
  };

  // ── Card name extraction ──

  function getCardName(cardEl) {
    for (const cls of cardEl.classList) {
      if (
        cls.startsWith('card-') &&
        cls !== 'card-container' &&
        cls !== 'card-unavailable' &&
        cls !== 'card-standard-project' &&
        cls !== 'card-hide'
      ) {
        const kebab = cls.slice(5);
        if (kebabLookup[kebab]) return kebabLookup[kebab];
      }
    }

    const titleEl = cardEl.querySelector('.card-title');
    if (titleEl) {
      const textEls = titleEl.querySelectorAll(
        'div:not(.prelude-label):not(.corporation-label):not(.ceo-label)'
      );
      for (const el of textEls) {
        const text = el.textContent.trim().split(':')[0].trim();
        if (text && TM_RATINGS[text]) return text;
      }
      const directText = titleEl.textContent.trim().split(':')[0].trim();
      if (directText && TM_RATINGS[directText]) return directText;
    }
    return null;
  }

  // ── Badge injection ──

  function injectBadge(cardEl) {
    if (cardEl.querySelector('.tm-tier-badge')) return;

    const name = getCardName(cardEl);
    if (!name || !TM_RATINGS[name]) return;

    const data = TM_RATINGS[name];
    const { s, t } = data;
    const visible = tierFilter[t] !== false;

    const badge = document.createElement('div');
    badge.className = 'tm-tier-badge tm-tier-' + t;
    badge.textContent = t + ' ' + s;
    if (!visible) badge.style.display = 'none';

    badge.style.pointerEvents = 'auto';
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', (e) => {
      if (e.ctrlKey) { e.stopPropagation(); addToCompare(name); }
    });

    cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
    cardEl.setAttribute('data-tm-card', name);
    cardEl.setAttribute('data-tm-tier', t);

    // Tooltip on entire card hover
    if (!cardEl.hasAttribute('data-tm-tip')) {
      cardEl.setAttribute('data-tm-tip', '1');
      cardEl.addEventListener('mouseenter', (e) => showTooltip(e, name, data));
      cardEl.addEventListener('mouseleave', hideTooltip);
    }

    if (t === 'D' || t === 'F') {
      cardEl.classList.add('tm-dim');
    }
  }

  // ── Tooltip panel ──

  let tooltipEl = null;

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tm-tooltip-panel';
    document.body.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => {
      tooltipEl.style.display = 'block';
    });
    tooltipEl.addEventListener('mouseleave', hideTooltip);
    return tooltipEl;
  }

  function showTooltip(e, name, data) {
    const tip = ensureTooltip();

    // Try to read card cost from DOM
    let costText = '';
    const cardEl = e.target.closest('.card-container');
    if (cardEl) {
      const costEl = cardEl.querySelector('.card-number, .card-cost');
      if (costEl) {
        const c = parseInt(costEl.textContent);
        if (!isNaN(c)) costText = c + ' MC';
      }
    }

    // Calculate effective cost with steel/titanium
    let effectiveCostHtml = '';
    if (costText && cardEl) {
      const cost = parseInt(costText);
      if (!isNaN(cost) && cost > 0) {
        const pv0 = getPlayerVueData();
        if (pv0 && pv0.thisPlayer) {
          const tags = getCardTags(cardEl);
          const myP = pv0.thisPlayer;
          const stVal = myP.steelValue || 2;
          const tiVal = myP.titaniumValue || 3;
          let discount = 0;
          let discountLabel = '';

          // Corp/card tag discounts
          let tagDiscount = 0;
          const myCorp0 = detectMyCorp();
          const myTableau0 = [];
          if (myP.tableau) myP.tableau.forEach(function(c) { myTableau0.push(c.name || c); });
          const allDiscountSources = myCorp0 ? [myCorp0].concat(myTableau0) : myTableau0;
          for (const src of allDiscountSources) {
            const cd = CORP_DISCOUNTS[src] || CARD_DISCOUNTS[src];
            if (!cd) continue;
            if (cd._all) tagDiscount += cd._all;
            for (const tag of tags) {
              const tLower = tag.toLowerCase();
              if (cd[tLower]) tagDiscount += cd[tLower];
            }
          }
          if (tagDiscount > 0) {
            discount += Math.min(tagDiscount, cost);
            discountLabel = '−' + tagDiscount + ' дискаунт';
          }

          let afterDiscount = Math.max(0, cost - discount);

          // Steel payment
          if (tags.has('building') || tags.has('Building')) {
            const stUsable = Math.min(myP.steel || 0, Math.floor(afterDiscount / stVal));
            const stDisc = stUsable * stVal;
            if (stDisc > 0) {
              discount += stDisc;
              afterDiscount -= stDisc;
              discountLabel += (discountLabel ? ' ' : '') + '−' + stUsable + '⚒=' + stDisc;
            }
          }
          // Titanium payment
          if (tags.has('space') || tags.has('Space')) {
            const tiUsable = Math.min(myP.titanium || 0, Math.floor(afterDiscount / tiVal));
            const tiDiscount = tiUsable * tiVal;
            if (tiDiscount > 0) {
              discount += tiDiscount;
              afterDiscount -= tiDiscount;
              discountLabel += (discountLabel ? ' ' : '') + '−' + tiUsable + 'Ti=' + tiDiscount;
            }
          }
          if (discount > 0) {
            const effCost = Math.max(0, cost - discount);
            effectiveCostHtml = ' <span style="color:#4caf50;font-size:11px">→ ' + effCost + ' MC (' + discountLabel + ')</span>';
          }
        }
      }
    }

    let html = '<div class="tm-tip-header">';
    html += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + ' ' + data.s + '</span> ';
    if (costText) html += '<span class="tm-tip-cost">' + costText + effectiveCostHtml + '</span> ';
    html += '<span class="tm-tip-name">' + escHtml(ruName(name)) + '</span>';
    if (ruName(name) !== name) {
      html += '<br><span class="tm-tip-ru">' + escHtml(name) + '</span>';
    }
    html += '</div>';

    if (data.e) {
      html += '<div class="tm-tip-row"><b>Экон:</b> ' + escHtml(data.e) + '</div>';
    }
    // Card efficiency removed (MC/очко — not practical)
    if (data.w) {
      html += '<div class="tm-tip-row"><b>Когда:</b> ' + escHtml(data.w) + '</div>';
    }
    if (data.r) {
      const rText = escHtml(data.r);
      const rHtml = data.c
        ? '<a href="https://reddit.com' + data.c + '" target="_blank" style="color:#ff6b35;text-decoration:none">' + rText + ' ↗</a>'
        : rText;
      html += '<div class="tm-tip-row" style="color:#ff6b35"><b>Reddit:</b> ' + rHtml + '</div>';
    }
    if (data.y && data.y.length && data.y[0] !== 'None significant') {
      html += '<div class="tm-tip-row"><b>Синергии:</b> ' + data.y.map(escHtml).join(', ') + '</div>';
    }

    // Corp synergy indicator + ability reminder
    const myCorp = detectMyCorp();
    if (myCorp && data.y && data.y.some((syn) => syn === myCorp)) {
      let corpHint = '';
      const corpAbilities = {
        'Point Luna': '+1 MC +1 Card за Earth тег',
        'Teractor': '−3 MC на Earth карты',
        'Splice': '+2 MC (или +microbe) за Microbe тег',
        'Inventrix': '−2 к требованиям',
        'Credicor': '−4 MC за карты 20+ MC',
        'Interplanetary Cinematics': '+2 MC за Event',
        'Phobolog': 'Ti стоит 4 MC',
        'Mining Guild': '+1 steel-prod при Steel/Ti placement',
        'Thorgate': '−3 MC на Power теги',
        'Ecoline': 'Озеленение за 7 растений',
        'Helion': 'Heat = MC',
        'Tharsis Republic': '+1 MC-prod за город',
        'Morning Star Inc': '−2 Venus требования',
        'Manutech': 'Prod increase = resource',
        'Aridor': '+1 MC-prod за новый тип тега',
        'Arklight': '+1 VP за Animal/Plant resource',
        'Celestic': '+1 VP за 3 floaters',
        'Stormcraft': 'Floaters = Heat (2:1)',
        'Polyphemos': 'Buy cards 5 MC, sell 1 MC',
        'Robinson Industries': '−1 MC: raise lowest prod',
        'Lakefront': '+1 MC за ocean',
        'Poseidon': '+1 MC-prod за колонию',
        'Recyclon': '+1 microbe или +1 prod за Building',
        'Viron': 'Повторить action карту',
      };
      corpHint = corpAbilities[myCorp] || '';
      html += '<div class="tm-tip-row tm-tip-corp-syn">&#9733; Синергия с ' + escHtml(ruName(myCorp)) + (corpHint ? ' — ' + escHtml(corpHint) : '') + '</div>';
    }

    // 3P take-that context
    if (TAKE_THAT_CARDS[name]) {
      html += '<div class="tm-tip-row" style="color:#f39c12"><b>3P:</b> ' + escHtml(TAKE_THAT_CARDS[name]) + '</div>';
    }

    // Event card counter for Legend milestone
    if (cardEl) {
      const isEvent = cardEl.classList.contains('card-type--event') ||
        cardEl.querySelector('.card-content--red') ||
        (data.e && data.e.toLowerCase().includes('event'));
      if (isEvent) {
        const pv = getPlayerVueData();
        let eventCount = 0;
        if (pv && pv.thisPlayer && pv.thisPlayer.tags) {
          const evTag = pv.thisPlayer.tags.find(function(t) { return (t.tag || '').toLowerCase() === 'event'; });
          if (evTag) eventCount = evTag.count || 0;
        }
        html += '<div class="tm-tip-row" style="color:#e74c3c"><b>Events:</b> ' + eventCount + ' сыграно' +
          (eventCount >= 4 ? ' (Legend: ' + eventCount + '/5)' : '') + '</div>';
      }
    }

    // Timing warning for production cards
    {
      const curGen = detectGeneration();
      if (curGen >= 7 && data.e) {
        const econLower = data.e.toLowerCase();
        if (econLower.includes('прод') || econLower.includes('prod') || econLower.includes('mc/gen') || econLower.includes('-prod')) {
          html += '<div class="tm-tip-row" style="color:#e74c3c;font-weight:bold">⚠ Пок. ' + curGen + ' — поздно для продукции</div>';
        }
      }
    }

    // Combo requirements
    if (typeof TM_COMBOS !== 'undefined') {
      for (const combo of TM_COMBOS) {
        if (!combo.cards.includes(name) || !combo.req) continue;
        html += '<div class="tm-tip-row" style="color:#bb86fc"><b>Комбо req:</b> ' + escHtml(combo.req) + '</div>';
      }
    }

    // Tag density info
    if (cardEl) {
      const tags = getCardTags(cardEl);
      if (tags.size > 0) {
        const ctx = getCachedPlayerContext();
        if (ctx) {
          const tagInfo = [];
          for (const tag of tags) {
            const count = ctx.tags[tag] || 0;
            if (count >= 2) tagInfo.push(tag + ' x' + count + ' -> ' + (count + 1));
          }
          if (tagInfo.length > 0) {
            html += '<div class="tm-tip-row"><b>Теги:</b> ' + tagInfo.map(escHtml).join(', ') + '</div>';
          }
        }
        // Tag triggers on my tableau — which cards benefit from this card's tags
        const triggerHits = [];
        const myTableauNames = [];
        const pv2 = getPlayerVueData();
        if (pv2 && pv2.thisPlayer && pv2.thisPlayer.tableau) {
          for (const c of pv2.thisPlayer.tableau) myTableauNames.push(c.name || c);
        }
        const corpName = detectMyCorp();
        if (corpName) myTableauNames.push(corpName);
        for (const tName of myTableauNames) {
          const trigs = TAG_TRIGGERS[tName];
          if (!trigs) continue;
          for (const tr of trigs) {
            for (const tag of tags) {
              if (tr.tags.includes(tag.toLowerCase())) {
                triggerHits.push(tr.desc + ' (+~' + tr.value + ' MC)');
              }
            }
          }
        }
        if (triggerHits.length > 0) {
          html += '<div class="tm-tip-row" style="color:#2ecc71"><b>Триггеры:</b> ' + triggerHits.map(escHtml).join(', ') + '</div>';
        }
        // Hand synergy count — how many cards in hand share tags with this card
        const handNames = getMyHandNames();
        if (handNames.length > 0) {
          let synCount = 0;
          for (const hn of handNames) {
            if (hn === name) continue;
            const hd = TM_RATINGS[hn];
            if (!hd || !hd.y) continue;
            for (const tag of tags) {
              if (hd.y.some(function(s) { return s.toLowerCase().includes(tag.toLowerCase()); })) {
                synCount++;
                break;
              }
            }
          }
          if (synCount > 0) {
            html += '<div class="tm-tip-row" style="color:#9b59b6"><b>В руке:</b> ' + synCount + ' карт с похожими тегами</div>';
          }
        }
      }
    }

    // Dynamic gen multipliers removed (not practical in tooltip)

    // Card combo detector — check synergies with hand cards
    {
      const handNames = getMyHandNames();
      if (handNames.length > 0 && data.y && data.y.length > 0) {
        const combos = [];
        for (const hName of handNames) {
          if (hName === name) continue;
          const hData = TM_RATINGS[hName];
          if (!hData) continue;
          // Check if this card's synergies mention hand card or vice versa
          const thisMentionsHand = data.y.some(function(s) { return s.toLowerCase().includes(hName.toLowerCase()); });
          const handMentionsThis = hData.y && hData.y.some(function(s) { return s.toLowerCase().includes(name.toLowerCase()); });
          if (thisMentionsHand || handMentionsThis) {
            combos.push(hName);
          }
        }
        if (combos.length > 0) {
          html += '<div class="tm-tip-row" style="color:#bb86fc;font-weight:bold">🔗 В руке: ' + combos.map(function(c) { return escHtml(ruName(c)); }).join(', ') + '</div>';
        }
      }
    }

    // Requirement check — can this card be played now?
    if (cardEl) {
      const pv = getPlayerVueData();
      if (pv && pv.game) {
        const reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
        if (reqEl) {
          const reqText = (reqEl.textContent || '').trim();
          const checks = [];
          const gTemp = pv.game.temperature;
          const gOxy = pv.game.oxygenLevel;
          const gOce = pv.game.oceans;
          const gVen = pv.game.venusScaleLevel;

          // Parse common requirements
          const tempMatch = reqText.match(/([\-\d]+)\s*°?C/i);
          const oxyMatch = reqText.match(/(\d+)\s*%?\s*O/i);
          const oceanMatch = reqText.match(/(\d+)\s*ocean/i);
          const venusMatch = reqText.match(/(\d+)\s*%?\s*Venus/i);

          if (tempMatch && typeof gTemp === 'number') {
            const reqVal = parseInt(tempMatch[1]);
            const met = reqText.includes('max') ? gTemp <= reqVal : gTemp >= reqVal;
            checks.push({ label: 'Темп ' + gTemp + '°C (нужно ' + reqVal + '°C)', met: met });
          }
          if (oxyMatch && typeof gOxy === 'number') {
            const reqVal = parseInt(oxyMatch[1]);
            const met = reqText.includes('max') ? gOxy <= reqVal : gOxy >= reqVal;
            checks.push({ label: 'O₂ ' + gOxy + '% (нужно ' + reqVal + '%)', met: met });
          }
          if (oceanMatch && typeof gOce === 'number') {
            const reqVal = parseInt(oceanMatch[1]);
            const met = reqText.includes('max') ? gOce <= reqVal : gOce >= reqVal;
            checks.push({ label: 'Океаны ' + gOce + ' (нужно ' + reqVal + ')', met: met });
          }
          if (venusMatch && typeof gVen === 'number') {
            const reqVal = parseInt(venusMatch[1]);
            const met = reqText.includes('max') ? gVen <= reqVal : gVen >= reqVal;
            checks.push({ label: 'Венера ' + gVen + '% (нужно ' + reqVal + '%)', met: met });
          }

          if (checks.length > 0) {
            const allMet = checks.every(function(c) { return c.met; });
            for (const c of checks) {
              const icon = c.met ? '✓' : '✗';
              const color = c.met ? '#4caf50' : '#f44336';
              html += '<div class="tm-tip-row" style="color:' + color + '">' + icon + ' ' + c.label + '</div>';
            }
            if (!allMet) {
              html += '<div class="tm-tip-row" style="color:#f44336;font-weight:bold">⚠ Требования не выполнены</div>';
            }
          }
        }
      }
    }

    // Draft scoring reasons (if card has been scored)
    if (cardEl) {
      const reasonsStr = cardEl.getAttribute('data-tm-reasons');
      if (reasonsStr) {
        const reasons = reasonsStr.split('|');
        html += '<div class="tm-tip-row" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.15);padding-top:3px"><b>Контекст:</b> ' + reasons.map(escHtml).join(', ') + '</div>';
      }
    }

    tip.innerHTML = html;
    tip.style.display = 'block';
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function escHtml(s) {
    const d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Generation detection & dynamic value ──

  let cachedGen = 1;
  let genCacheTime = 0;

  function detectGeneration() {
    if (Date.now() - genCacheTime < 2000) return cachedGen;
    genCacheTime = Date.now();

    // Try Vue data first
    const pv = getPlayerVueData();
    if (pv && pv.game && pv.game.generation) {
      cachedGen = pv.game.generation;
      return cachedGen;
    }

    // Fallback: DOM
    const genEl = document.querySelector('.gen_marker.active, .log-gen-num.active');
    if (genEl) {
      const n = parseInt(genEl.textContent);
      if (n > 0) cachedGen = n;
    }
    return cachedGen;
  }

  // MC value multipliers by generation (avg game ~9 gens)
  // Based on CLAUDE.md formulas
  function getValueMultipliers(gen) {
    const gensLeft = Math.max(1, 9 - gen);
    return {
      mcProd: Math.min(6, gensLeft * 0.9),    // MC-prod worth ~0.9 MC per gen remaining
      steelProd: Math.min(9, gensLeft * 1.3),
      tiProd: Math.min(14, gensLeft * 2.0),
      plantProd: Math.min(9, gensLeft * 1.3),
      energyProd: Math.min(8, gensLeft * 1.1),
      heatProd: Math.min(5, gensLeft * 0.6),
      tr: 7 + (gen > 6 ? 1 : 0),              // TR=7-8 MC
      vp: 1 + (gen - 1) * 0.875,               // VP scales from 1 to ~8 MC over 9 gens
      card: 3.5,                                // card draw ~ 3-4 MC always
    };
  }

  // ── For The Nerd value table (gensLeft → [tr, prod, vp] in MC) ──

  const FTN_TABLE = {
    0:  [8.0, 0.0, 8.0],
    1:  [8.0, 0.5, 7.5],
    2:  [8.0, 1.2, 6.8],
    3:  [8.0, 2.0, 6.0],
    4:  [7.9, 2.9, 5.0],
    5:  [7.8, 3.9, 3.9],
    6:  [7.6, 4.8, 2.8],
    7:  [7.4, 5.4, 2.0],
    8:  [7.2, 5.6, 1.6],
    9:  [7.1, 5.7, 1.4],
    10: [7.0, 5.8, 1.2],
    11: [7.0, 5.9, 1.1],
    12: [7.0, 6.0, 1.0],
    13: [7.0, 6.0, 1.0],
  };

  // Resource production multipliers (relative to MC-prod)
  const PROD_MUL = { mp: 1, sp: 1.6, tp: 2.5, pp: 1.6, ep: 1.5, hp: 0.8 };
  // Immediate resource values (MC per unit)
  const RES_VAL = { mc: 1, st: 2, ti: 3, pl: 1.6, he: 0.5, en: 1, cd: 3 };

  function computeCardValue(fx, gensLeft) {
    const gl = Math.max(0, Math.min(13, gensLeft));
    const row = FTN_TABLE[gl];
    const trVal = row[0];
    const prod = row[1];
    const vpVal = row[2];

    let v = 0;

    // Production
    for (const k of ['mp', 'sp', 'tp', 'pp', 'ep', 'hp']) {
      if (fx[k]) v += fx[k] * prod * PROD_MUL[k];
    }

    // Immediate resources
    for (const k of ['mc', 'st', 'ti', 'pl', 'he', 'en', 'cd']) {
      if (fx[k]) v += fx[k] * RES_VAL[k];
    }

    // TR
    if (fx.tr) v += fx.tr * trVal;

    // VP
    if (fx.vp) v += fx.vp * vpVal;

    // Global param raises
    if (fx.tmp) v += fx.tmp * trVal;
    if (fx.o2) v += fx.o2 * trVal;
    if (fx.oc) v += fx.oc * (trVal + 3);  // ocean = TR + placement bonus
    if (fx.vn) v += fx.vn * trVal;

    // Tiles
    if (fx.grn) v += fx.grn * (trVal + vpVal + 3);  // greenery = O2 TR + 1VP + placement bonus
    if (fx.city) v += fx.city * (3 + vpVal * 2);     // city = placement bonus + ~2VP adjacency

    // Take-that (halved for 3P — benefits third player)
    if (fx.rmPl) v += fx.rmPl * 1.6 * 0.5;
    if (fx.pOpp) v += Math.abs(fx.pOpp) * prod * 0.5;

    // VP accumulator (action: add resource, 1VP per N — VP realized at game end = 8 MC)
    if (fx.vpAcc) v += fx.vpAcc * gl * 8 / Math.max(1, fx.vpPer || 1);

    // Blue action cards
    if (fx.actMC) v += fx.actMC * gl;
    if (fx.actTR) v += fx.actTR * gl * trVal;
    if (fx.actCD) v += fx.actCD * gl * 3;

    return v;
  }

  // ── Corp synergy detection ──

  let cachedCorp = null;
  let corpCacheTime = 0;

  function detectMyCorp() {
    // Cache for 3 seconds
    if (Date.now() - corpCacheTime < 3000 && cachedCorp !== null) return cachedCorp;
    corpCacheTime = Date.now();

    // Look for corporation card in player's tableau
    // The player's area has class player_home_block--cards
    const myCards = document.querySelectorAll(
      '.player_home_block--cards .card-container[data-tm-card]'
    );
    for (const el of myCards) {
      const name = el.getAttribute('data-tm-card');
      // Corporation cards have the .is-corporation class on their title
      const corpTitle = el.querySelector('.card-title.is-corporation, .card-corporation-logo');
      if (corpTitle && name) {
        cachedCorp = name;
        return name;
      }
    }

    // Fallback: check for corporation label
    for (const el of myCards) {
      const name = el.getAttribute('data-tm-card');
      const corpLabel = el.querySelector('.corporation-label');
      if (corpLabel && name) {
        cachedCorp = name;
        return name;
      }
    }

    cachedCorp = '';
    return '';
  }

  // Cached player context (light version for tag synergies)
  let cachedCtx = null;
  let ctxCacheTime = 0;

  function getCachedPlayerContext() {
    if (Date.now() - ctxCacheTime < 3000 && cachedCtx !== null) return cachedCtx;
    ctxCacheTime = Date.now();
    cachedCtx = getPlayerContext();
    return cachedCtx;
  }

  /**
   * Highlight cards that synergize with the player's corporation
   * + Tag-based soft synergies via TAG_TRIGGERS and CARD_DISCOUNTS
   */
  function highlightCorpSynergies() {
    // Remove old highlights
    document.querySelectorAll('.tm-corp-synergy').forEach((el) => {
      el.classList.remove('tm-corp-synergy');
    });
    document.querySelectorAll('.tm-tag-synergy').forEach((el) => {
      el.classList.remove('tm-tag-synergy');
    });

    const myCorp = detectMyCorp();
    if (!myCorp) return;

    // Build reverse synergy map: which cards list myCorp as synergy?
    document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (!name || name === myCorp) return;
      const data = TM_RATINGS[name];
      if (!data || !data.y) return;

      // Check if this card synergizes with our corp
      if (data.y.some((syn) => syn === myCorp || syn.includes(myCorp))) {
        el.classList.add('tm-corp-synergy');
      }
    });

    // Also check corp's own synergy list against visible cards
    const corpData = TM_RATINGS[myCorp];
    if (corpData && corpData.y) {
      const corpSyns = new Set(corpData.y);
      document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (name && corpSyns.has(name)) {
          el.classList.add('tm-corp-synergy');
        }
      });
    }

    // Tag-based soft synergies: collect trigger tags from corp + tableau cards
    const triggerTags = new Set();

    // Corp triggers
    if (TAG_TRIGGERS[myCorp]) {
      TAG_TRIGGERS[myCorp].forEach((t) => t.tags.forEach((tag) => triggerTags.add(tag)));
    }

    // Corp discounts → tag affinity
    if (CORP_DISCOUNTS[myCorp]) {
      for (const tag in CORP_DISCOUNTS[myCorp]) {
        if (!tag.startsWith('_')) triggerTags.add(tag);
      }
    }

    // Tableau card triggers and discounts
    const tableauNames = getMyTableauNames();
    for (const cardName of tableauNames) {
      if (TAG_TRIGGERS[cardName]) {
        TAG_TRIGGERS[cardName].forEach((t) => t.tags.forEach((tag) => triggerTags.add(tag)));
      }
      if (CARD_DISCOUNTS[cardName]) {
        for (const tag in CARD_DISCOUNTS[cardName]) {
          if (!tag.startsWith('_')) triggerTags.add(tag);
        }
      }
    }

    if (triggerTags.size === 0) return;

    // Apply soft highlight to cards matching trigger tags
    document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
      if (el.classList.contains('tm-corp-synergy')) return; // already highlighted stronger
      const tags = getCardTags(el);
      for (const tag of tags) {
        if (triggerTags.has(tag)) {
          el.classList.add('tm-tag-synergy');
          break;
        }
      }
    });
  }

  // ── Combo highlighting (with rating colors) ──

  function checkCombos() {
    if (typeof TM_COMBOS === 'undefined') return;

    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    document.querySelectorAll('.tm-combo-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('.tm-combo-hint').forEach((el) => el.classList.remove('tm-combo-hint'));
    document.querySelectorAll('.tm-anti-combo').forEach((el) => el.classList.remove('tm-anti-combo'));
    document.querySelectorAll('.tm-anti-combo-tooltip').forEach((el) => el.remove());

    const cardEls = document.querySelectorAll('.card-container[data-tm-card]');
    const visibleNames = new Set();
    const nameToEls = {};

    cardEls.forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (name) {
        visibleNames.add(name);
        if (!nameToEls[name]) nameToEls[name] = [];
        nameToEls[name].push(el);
      }
    });

    for (const combo of TM_COMBOS) {
      const matched = combo.cards.filter((c) => visibleNames.has(c));
      if (matched.length >= 2) {
        const rating = combo.r || 'decent';
        const comboClass = 'tm-combo-' + rating;

        matched.forEach((cardName) => {
          (nameToEls[cardName] || []).forEach((el) => {
            el.classList.add('tm-combo-highlight', comboClass);
            if (!el.querySelector('.tm-combo-tooltip')) {
              const tip = document.createElement('div');
              tip.className = 'tm-combo-tooltip tm-combo-tip-' + rating;
              const ratingLabels = { godmode: 'Богомод', great: 'Отлично', good: 'Хорошо', decent: 'Неплохо', niche: 'Ниша' };
              tip.textContent = (ratingLabels[rating] || rating) + ': ' + combo.v;
              el.appendChild(tip);
            }
          });
        });
      }
    }

    // One-sided combo hint: 1 card from a good+ combo → dashed hint
    for (const combo of TM_COMBOS) {
      if (combo.r !== 'godmode' && combo.r !== 'great' && combo.r !== 'good') continue;
      const matched = combo.cards.filter((c) => visibleNames.has(c));
      if (matched.length === 1) {
        const cardName = matched[0];
        (nameToEls[cardName] || []).forEach((el) => {
          if (el.classList.contains('tm-combo-highlight')) return;
          el.classList.add('tm-combo-hint');
        });
      }
    }

    // Anti-combos: negative synergies
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (const anti of TM_ANTI_COMBOS) {
        const matched = anti.cards.filter((c) => visibleNames.has(c));
        if (matched.length >= 2) {
          matched.forEach((cardName) => {
            (nameToEls[cardName] || []).forEach((el) => {
              el.classList.add('tm-anti-combo');
              if (!el.querySelector('.tm-anti-combo-tooltip')) {
                const tip = document.createElement('div');
                tip.className = 'tm-anti-combo-tooltip';
                tip.textContent = 'Конфликт: ' + anti.v;
                el.appendChild(tip);
              }
            });
          });
        }
      }
    }
  }

  // Draft summary panel — removed

  // ── Tier filter ──

  function reapplyFilter() {
    document.querySelectorAll('.card-container[data-tm-tier]').forEach((el) => {
      const tier = el.getAttribute('data-tm-tier');
      const badge = el.querySelector('.tm-tier-badge');
      if (badge) {
        badge.style.display = tierFilter[tier] !== false ? '' : 'none';
      }
    });
  }

  // ── Process / Remove ──

  function processAll() {
    if (!enabled) return;
    document.querySelectorAll('.card-container:not([data-tm-processed])').forEach((el) => {
      injectBadge(el);
      el.setAttribute('data-tm-processed', '1');
    });
    checkCombos();
    highlightCorpSynergies();
    updateDraftRecommendations();
    updateAdvisor();
    updateOppTracker();
    updateHandSort();
    trackSeenCards();
    trackDraftHistory();
    updateIncomeProjection();
    updateCardPool();
    analyzePlayOrder();
    updateTagCounter();
    updateDraftLens();
    updateVPTracker();
    updateGlobals();
    updatePlayableHighlight();
    updateTurmoilTracker();
    updateColonyPanel();
    updateActionReminder();
    checkGenChange();
    trackTRHistory();
    updateBestHandCard();
    updateResourceBar();
    checkGameEnd();
    trackCardAge();
    updateCardAgeIndicators();
    checkToastTriggers();
  }

  function removeAll() {
    document.querySelectorAll('.tm-tier-badge').forEach((el) => el.remove());
    document.querySelectorAll('.tm-combo-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    document.querySelectorAll('.tm-dim').forEach((el) => el.classList.remove('tm-dim'));
    document.querySelectorAll('.tm-corp-synergy').forEach((el) => el.classList.remove('tm-corp-synergy'));
    document.querySelectorAll('.tm-tag-synergy').forEach((el) => el.classList.remove('tm-tag-synergy'));
    document.querySelectorAll('.tm-combo-hint').forEach((el) => el.classList.remove('tm-combo-hint'));
    document.querySelectorAll('.tm-anti-combo').forEach((el) => el.classList.remove('tm-anti-combo'));
    document.querySelectorAll('.tm-anti-combo-tooltip').forEach((el) => el.remove());
    document.querySelectorAll('[data-tm-processed]').forEach((el) => {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));
    document.querySelectorAll('[data-tm-reasons]').forEach((el) => el.removeAttribute('data-tm-reasons'));
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach((badge) => {
      const orig = badge.getAttribute('data-tm-original');
      badge.textContent = orig;
      const origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) badge.className = 'tm-tier-badge tm-tier-' + origTier;
      badge.removeAttribute('data-tm-original');
      badge.removeAttribute('data-tm-orig-tier');
    });
    document.querySelectorAll('.tm-sort-badge').forEach((el) => el.remove());
    if (advisorEl) advisorEl.style.display = 'none';
    if (oppTrackerEl) oppTrackerEl.style.display = 'none';
    if (incomeEl) incomeEl.style.display = 'none';
    if (poolEl) poolEl.style.display = 'none';
    if (playOrderEl) playOrderEl.style.display = 'none';
    if (tagCounterEl) tagCounterEl.style.display = 'none';
    if (lensEl) lensEl.style.display = 'none';
    // timerEl removed
    if (vpEl) vpEl.style.display = 'none';
    if (globalsEl) globalsEl.style.display = 'none';
    if (turmoilEl) turmoilEl.style.display = 'none';
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });
    document.querySelectorAll('.tm-lens-dim').forEach((el) => el.classList.remove('tm-lens-dim'));
    document.querySelectorAll('.tm-action-reminder').forEach((el) => el.remove());
    hideTooltip();
  }

  // ── Card search overlay ──

  let searchEl = null;
  let searchOpen = false;

  let searchTierFilter = null; // null = all tiers

  function buildSearchOverlay() {
    if (searchEl) return searchEl;
    searchEl = document.createElement('div');
    searchEl.className = 'tm-search-overlay';
    searchEl.innerHTML =
      '<div class="tm-search-header">' +
        '<input type="text" class="tm-search-input" placeholder="Поиск карт..." autocomplete="off">' +
        '<span class="tm-search-close">&times;</span>' +
      '</div>' +
      '<div class="tm-search-tier-bar">' +
        '<button class="tm-search-tier-btn tm-search-tier-active" data-tier="">Все</button>' +
        '<button class="tm-search-tier-btn" data-tier="S">S</button>' +
        '<button class="tm-search-tier-btn" data-tier="A">A</button>' +
        '<button class="tm-search-tier-btn" data-tier="B">B</button>' +
        '<button class="tm-search-tier-btn" data-tier="C">C</button>' +
        '<button class="tm-search-tier-btn" data-tier="D">D</button>' +
        '<button class="tm-search-tier-btn" data-tier="F">F</button>' +
      '</div>' +
      '<div class="tm-search-count"></div>' +
      '<div class="tm-search-results"></div>';
    document.body.appendChild(searchEl);

    const input = searchEl.querySelector('.tm-search-input');
    const results = searchEl.querySelector('.tm-search-results');
    const countEl = searchEl.querySelector('.tm-search-count');
    const closeBtn = searchEl.querySelector('.tm-search-close');

    closeBtn.addEventListener('click', closeSearch);

    // Tier filter buttons
    searchEl.querySelectorAll('.tm-search-tier-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        searchEl.querySelectorAll('.tm-search-tier-btn').forEach((b) => b.classList.remove('tm-search-tier-active'));
        btn.classList.add('tm-search-tier-active');
        searchTierFilter = btn.getAttribute('data-tier') || null;
        doSearch();
      });
    });

    function doSearch() {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2 && !searchTierFilter) { results.innerHTML = ''; countEl.textContent = ''; return; }

      const matches = [];
      for (const name in TM_RATINGS) {
        const data = TM_RATINGS[name];
        // Tier filter
        if (searchTierFilter && data.t !== searchTierFilter) continue;

        // Text filter (skip if empty query and we have tier filter)
        if (q.length >= 2) {
          const matchEn = name.toLowerCase().includes(q);
          const ruN = (typeof TM_NAMES_RU !== 'undefined' && TM_NAMES_RU[name]) || '';
          const matchRu = ruN.toLowerCase().includes(q);
          if (!matchEn && !matchRu) continue;
        }

        matches.push({ name, data });
        if (matches.length >= 30) break;
      }

      // Sort by score desc
      matches.sort((a, b) => b.data.s - a.data.s);

      countEl.textContent = matches.length >= 30 ? '30+ результатов' : matches.length + ' результатов';

      if (matches.length === 0) {
        results.innerHTML = '<div class="tm-search-empty">Ничего не найдено</div>';
        return;
      }

      let html = '';
      for (const m of matches) {
        html += '<div class="tm-search-item" data-card="' + escHtml(m.name) + '">';
        html += '<span class="tm-tip-tier tm-tier-' + m.data.t + '">' + m.data.t + ' ' + m.data.s + '</span> ';
        html += '<span class="tm-search-name">' + escHtml(ruName(m.name)) + '</span>';
        if (ruName(m.name) !== m.name) html += ' <span class="tm-search-ru">' + escHtml(m.name) + '</span>';
        if (m.data.e) html += '<div class="tm-search-detail">' + escHtml(m.data.e) + '</div>';
        if (m.data.w) html += '<div class="tm-search-detail">' + escHtml(m.data.w) + '</div>';
        if (m.data.y && m.data.y.length && m.data.y[0] !== 'None significant') {
          html += '<div class="tm-search-detail"><b>Синергии:</b> ' + m.data.y.map(escHtml).join(', ') + '</div>';
        }
        html += '</div>';
      }
      results.innerHTML = html;
    }

    input.addEventListener('input', doSearch);

    return searchEl;
  }

  function openSearch() {
    const overlay = buildSearchOverlay();
    overlay.style.display = 'block';
    searchOpen = true;
    setTimeout(() => overlay.querySelector('.tm-search-input').focus(), 50);
  }

  function closeSearch() {
    if (searchEl) searchEl.style.display = 'none';
    searchOpen = false;
  }

  // ── Milestone/Award advisor ──

  const MA_DATA = {
    // Tharsis milestones
    'Terraformer': { type: 'milestone', map: 'Tharsis', desc: 'TR >= 35', check: 'tr', target: 35, reddit: 'One of the better milestones. Contested as 3rd on Tharsis after Builder/Gardener. 5 VP over 35 TR is a lot in a short game' },
    'Mayor': { type: 'milestone', map: 'Tharsis', desc: '3 cities', check: 'cities', target: 3 },
    'Gardener': { type: 'milestone', map: 'Tharsis', desc: '3 greeneries', check: 'greeneries', target: 3 },
    'Builder': { type: 'milestone', map: 'Tharsis', desc: '8 building tags', check: 'tags', tag: 'building', target: 8, reddit: 'Go for it naturally, not from the start, unless 3+ building tags in preludes. Usually the first claimed milestone' },
    'Planner': { type: 'milestone', map: 'Tharsis', desc: '16 cards in hand', check: 'hand', target: 16 },
    // Hellas milestones
    'Diversifier': { type: 'milestone', map: 'Hellas', desc: '8 different tags', check: 'uniqueTags', target: 8 },
    'Tactician': { type: 'milestone', map: 'Hellas', desc: '5 cards with requirements', check: 'reqCards', target: 5 },
    'Energizer': { type: 'milestone', map: 'Hellas', desc: '6 energy production', check: 'prod', resource: 'energy', target: 6 },
    'Rim Settler': { type: 'milestone', map: 'Hellas', desc: '3 Jovian tags', check: 'tags', tag: 'jovian', target: 3 },
    // Elysium milestones
    'Generalist': { type: 'milestone', map: 'Elysium', desc: 'All 6 productions +1', check: 'generalist' },
    'Specialist': { type: 'milestone', map: 'Elysium', desc: '10 in any production', check: 'maxProd', target: 10, reddit: 'Common in 2P with money or heat production. Harder in 3-4P' },
    'Ecologist': { type: 'milestone', map: 'Elysium', desc: '4 bio tags', check: 'bioTags', target: 4 },
    'Tycoon': { type: 'milestone', map: 'Elysium', desc: '15 project cards', check: 'tableau', target: 15 },
    'Legend': { type: 'milestone', map: 'Elysium', desc: '5 events', check: 'events', target: 5 },
    // M&A expansion milestones
    'Terran': { type: 'milestone', map: 'M&A', desc: '5 Earth tags', check: 'tags', tag: 'earth', target: 5, reddit: 'Hard to reach 5 Earth tags without dedicated strategy. Point Luna makes it much easier' },
    'Forester': { type: 'milestone', map: 'M&A', desc: '3 greenery tiles', check: 'greeneries', target: 3, reddit: '3 feels low, but greeneries are expensive early. Often contested' },
    'Manager': { type: 'milestone', map: 'M&A', desc: '4 productions at 2+', check: 'manager' },
    'Geologist': { type: 'milestone', map: 'M&A', desc: '5 same non-Earth tags', check: 'maxTag', target: 5 },
    'Polar Explorer': { type: 'milestone', map: 'M&A', desc: '3 tiles on bottom rows', check: 'polar', target: 3, reddit: 'Always try for the ocean spot. Pairs well with city placement strategy' },
    // Tharsis awards
    'Landlord': { type: 'award', map: 'Tharsis', desc: 'Most tiles', check: 'tiles' },
    'Scientist': { type: 'award', map: 'Tharsis', desc: 'Most science tags', check: 'tags', tag: 'science' },
    'Banker': { type: 'award', map: 'Tharsis', desc: 'Most MC production', check: 'prod', resource: 'megacredits' },
    'Thermalist': { type: 'award', map: 'Tharsis', desc: 'Most heat', check: 'resource', resource: 'heat', reddit: 'Better for engine (Mass Converter/Quantum) than terraforming. NOT good for Helion contrary to popular belief' },
    'Miner': { type: 'award', map: 'Tharsis', desc: 'Most steel + titanium', check: 'steelTi', reddit: 'Very competitive. Best with steel/ti production corps. Fund early before opponents accumulate resources' },
    // Hellas awards
    'Cultivator': { type: 'award', map: 'Hellas', desc: 'Most greeneries', check: 'greeneries' },
    'Magnate': { type: 'award', map: 'Hellas', desc: 'Most green cards', check: 'greenCards' },
    'Space Baron': { type: 'award', map: 'Hellas', desc: 'Most space tags', check: 'tags', tag: 'space' },
    'Contractor': { type: 'award', map: 'Hellas', desc: 'Most building tags', check: 'tags', tag: 'building', reddit: 'Better online than in-person — avoids constant tag counting. Pairs well with Builder milestone' },
    // Elysium awards
    'Celebrity': { type: 'award', map: 'Elysium', desc: 'Most cards costing 20+', check: 'expensiveCards', reddit: 'Best when someone else funds it. Good for Space/Jovian heavy strategies with expensive cards' },
    'Industrialist': { type: 'award', map: 'Elysium', desc: 'Most steel + energy', check: 'steelEnergy' },
    'Benefactor': { type: 'award', map: 'Elysium', desc: 'Highest TR', check: 'tr' },
    // M&A expansion awards
    'Collector': { type: 'award', map: 'M&A', desc: 'Most resources on cards', check: 'cardResources', reddit: 'Not particularly swingy. Fun with Decomposers, animal cards, floater engines' },
    'Electrician': { type: 'award', map: 'M&A', desc: 'Most Power tags', check: 'tags', tag: 'power', reddit: 'Finally a reason to play Thorgate! Power tags become valuable' },
    'Suburbian': { type: 'award', map: 'M&A', desc: 'Most city tiles', check: 'cities', reddit: 'Less swingy, empowers ground game. Pairs well with Mayor milestone and city-heavy strategy' },
    'Landscaper': { type: 'award', map: 'M&A', desc: 'Most greenery tiles', check: 'greeneries', reddit: 'Many ways to fight and block it. Risky to fund — opponents can steal with late greeneries' },
  };

  let advisorEl = null;
  let advisorVisible = false;

  function getPlayerVueData() {
    const gameEl = document.querySelector('#game');
    if (!gameEl || !gameEl.__vue__) return null;

    function findPV(vue) {
      if (vue.playerView) return vue.playerView;
      if (vue.$data && vue.$data.playerView) return vue.$data.playerView;
      if (vue.$children) {
        for (const child of vue.$children) {
          const found = findPV(child);
          if (found) return found;
        }
      }
      return null;
    }
    return findPV(gameEl.__vue__);
  }

  function detectActiveMA() {
    // Read milestone/award names from the DOM
    const maNames = [];
    document.querySelectorAll('.ma-name, .milestone-award-inline').forEach((el) => {
      const text = el.textContent.trim();
      if (text) maNames.push(text);
    });
    return maNames;
  }

  function buildAdvisorPanel() {
    if (advisorEl) return advisorEl;
    advisorEl = document.createElement('div');
    advisorEl.className = 'tm-advisor-panel';
    document.body.appendChild(advisorEl);
    return advisorEl;
  }

  function updateAdvisor() {
    if (!advisorVisible || !enabled) {
      if (advisorEl) advisorEl.style.display = 'none';
      return;
    }

    const panel = buildAdvisorPanel();
    const pv = getPlayerVueData();

    // Read what we can from Vue or DOM
    const myData = {
      tr: 0,
      hand: 0,
      tableau: 0,
      tags: {},
      prod: {},
    };

    if (pv) {
      if (pv.thisPlayer) {
        const p = pv.thisPlayer;
        myData.tr = p.terraformRating || 0;
        myData.prod.megacredits = p.megaCreditProduction || 0;
        myData.prod.steel = p.steelProduction || 0;
        myData.prod.titanium = p.titaniumProduction || 0;
        myData.prod.plants = p.plantProduction || 0;
        myData.prod.energy = p.energyProduction || 0;
        myData.prod.heat = p.heatProduction || 0;
        myData.hand = (pv.cardsInHand || []).length;
        myData.tableau = (p.tableau || []).length;

        // Count tags from tableau
        if (p.tags) {
          for (const t of p.tags) {
            const tagName = (t.tag || '').toLowerCase();
            myData.tags[tagName] = (myData.tags[tagName] || 0) + t.count;
          }
        }
      }
    } else {
      // Fallback: count from DOM
      const handCards = document.querySelectorAll('.player_home_block--hand .card-container');
      myData.hand = handCards.length;
      const playedCards = document.querySelectorAll('.player_home_block--cards .card-container');
      myData.tableau = playedCards.length;
    }

    // Detect which MA are in this game
    const activeNames = detectActiveMA();

    let html = '<div class="tm-advisor-title">Вехи и Награды</div>';
    let hasContent = false;

    // Check milestones in MA_DATA that match active names
    for (const [name, ma] of Object.entries(MA_DATA)) {
      if (activeNames.length > 0 && !activeNames.some((n) => n.includes(name))) continue;

      let current = '?';
      let target = ma.target || '?';
      let pct = 0;

      if (ma.check === 'tr' && myData.tr) {
        current = myData.tr;
        pct = Math.min(100, (myData.tr / (ma.target || 35)) * 100);
      } else if (ma.check === 'hand') {
        current = myData.hand;
        pct = Math.min(100, (myData.hand / (ma.target || 16)) * 100);
      } else if (ma.check === 'tableau') {
        current = myData.tableau;
        pct = Math.min(100, (myData.tableau / (ma.target || 15)) * 100);
      } else if (ma.check === 'tags' && ma.tag) {
        current = myData.tags[ma.tag] || 0;
        pct = Math.min(100, (current / (ma.target || 1)) * 100);
      } else if (ma.check === 'prod' && ma.resource) {
        current = myData.prod[ma.resource] || 0;
        pct = Math.min(100, (current / (ma.target || 1)) * 100);
      } else if (ma.check === 'maxProd') {
        const maxP = Math.max(...Object.values(myData.prod).map(Number).filter((n) => !isNaN(n)), 0);
        current = maxP;
        pct = Math.min(100, (maxP / (ma.target || 10)) * 100);
      } else if (ma.check === 'bioTags') {
        current = (myData.tags['plant'] || 0) + (myData.tags['microbe'] || 0) + (myData.tags['animal'] || 0);
        pct = Math.min(100, (current / (ma.target || 4)) * 100);
      } else {
        continue; // Skip if we can't compute
      }

      if (current === '?' || current === 0) continue;

      hasContent = true;
      const typeIcon = ma.type === 'milestone' ? 'M' : 'A';
      const typeClass = ma.type === 'milestone' ? 'tm-adv-ms' : 'tm-adv-aw';
      const done = pct >= 100;

      html += '<div class="tm-adv-row' + (done ? ' tm-adv-done' : '') + '">';
      html += '<span class="tm-adv-icon ' + typeClass + '">' + typeIcon + '</span> ';
      html += '<span class="tm-adv-name">' + escHtml(name) + '</span>';
      html += '<div class="tm-adv-bar"><div class="tm-adv-fill" style="width:' + Math.round(pct) + '%"></div></div>';
      html += '<span class="tm-adv-val">' + current + '/' + target + '</span>';
      if (ma.reddit) {
        html += '<div class="tm-adv-reddit" style="color:#ff6b35;font-size:10px;padding:1px 0 2px 20px;opacity:0.85">' + escHtml(ma.reddit) + '</div>';
      }
      html += '</div>';
    }

    if (!hasContent) {
      panel.style.display = 'none';
      return;
    }

    // Milestone status — claimed and claimable
    if (pv && pv.game && pv.game.milestones) {
      const claimedList = [];
      for (const ms of pv.game.milestones) {
        if (ms.color || ms.playerName) {
          claimedList.push({ name: ms.name, player: ms.playerName || ms.color });
        } else if (ms.scores) {
          const myColor = pv.thisPlayer.color;
          const myMs = ms.scores.find(function(s) { return s.color === myColor; });
          if (myMs && myMs.claimable) {
            html += '<div class="tm-turm-warn" style="background:rgba(46,204,113,0.2);border-color:#2ecc71;color:#2ecc71">Можно заявить: ' + escHtml(ms.name) + '!</div>';
            hasContent = true;
          }
        }
      }
      if (claimedList.length > 0) {
        html += '<div style="font-size:10px;color:#888;margin-top:4px">Заявлены: ';
        html += claimedList.map(function(c) { return escHtml(c.name) + ' (' + escHtml(c.player) + ')'; }).join(', ');
        html += '</div>';
        hasContent = true;
      }
    }

    // Milestone race: show who's close among opponents
    if (pv && pv.players && pv.thisPlayer) {
      const opponents = pv.players.filter((p) => p.color !== pv.thisPlayer.color);
      const raceWarnings = [];

      for (const opp of opponents) {
        const oppName = opp.name || opp.color;
        // Check tag-based milestones for opponents
        if (opp.tags) {
          const oppTags = {};
          for (const t of opp.tags) {
            oppTags[(t.tag || '').toLowerCase()] = t.count || 0;
          }

          for (const [maName, ma] of Object.entries(MA_DATA)) {
            if (ma.type !== 'milestone') continue;
            if (activeNames.length > 0 && !activeNames.some((n) => n.includes(maName))) continue;

            let oppVal = 0;
            if (ma.check === 'tags' && ma.tag) oppVal = oppTags[ma.tag] || 0;
            else if (ma.check === 'tr') oppVal = opp.terraformRating || 0;
            else if (ma.check === 'bioTags') {
              oppVal = (oppTags['plant'] || 0) + (oppTags['microbe'] || 0) + (oppTags['animal'] || 0);
            }
            else continue;

            if (ma.target && oppVal >= ma.target - 1 && oppVal > 0) {
              raceWarnings.push(oppName + ': ' + oppVal + '/' + ma.target + ' в ' + maName + '!');
            }
          }
        }
      }

      if (raceWarnings.length > 0) {
        html += '<div class="tm-adv-race-title">Гонка за вехами</div>';
        for (const w of raceWarnings.slice(0, 4)) {
          html += '<div class="tm-adv-race-warn">' + escHtml(w) + '</div>';
        }
        hasContent = true;
      }
    }

    // Award race warnings — check who's winning funded awards
    if (pv && pv.game && pv.game.awards && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      const awardWarnings = [];
      for (const aw of pv.game.awards) {
        if (!(aw.playerName || aw.color)) continue; // not funded
        if (!aw.scores || aw.scores.length < 2) continue;
        const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        const myEntry = sorted.find(function(s) { return s.color === myColor; });
        if (!myEntry) continue;
        const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
        const leader = sorted[0];
        // Warn if I'm losing (not 1st)
        if (myRank > 0 && leader.color !== myColor) {
          const gap = leader.score - myEntry.score;
          const urgency = gap <= 2 ? 'близко' : 'отстаю';
          awardWarnings.push(aw.name + ': ' + leader.color + ' ' + leader.score + ' vs мои ' + myEntry.score + ' (' + urgency + ')');
        }
        // Warn if I'm 1st but it's tight
        if (myRank === 0 && sorted.length > 1 && sorted[1].score >= myEntry.score - 1) {
          awardWarnings.push(aw.name + ': лидирую ' + myEntry.score + ', но ' + sorted[1].color + ' ' + sorted[1].score + ' рядом');
        }
      }
      if (awardWarnings.length > 0) {
        html += '<div class="tm-adv-race-title">Гонка за наградами</div>';
        for (const w of awardWarnings.slice(0, 4)) {
          html += '<div class="tm-adv-race-warn" style="color:#ff9800">' + escHtml(w) + '</div>';
        }
        hasContent = true;
      }
    }

    // Unfunded awards — VP potential if I fund them
    if (pv && pv.game && pv.game.awards && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      const funded = pv.game.awards.filter(function(a) { return a.playerName || a.color; }).length;
      const costs = [8, 14, 20];
      if (funded < 3) {
        const unfundedGood = [];
        for (const aw of pv.game.awards) {
          if (aw.playerName || aw.color) continue; // already funded
          if (!aw.scores || aw.scores.length < 2) continue;
          const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
          const myEntry = sorted.find(function(s) { return s.color === myColor; });
          if (!myEntry) continue;
          const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
          const vpGain = myRank === 0 ? 5 : myRank === 1 ? 2 : 0;
          if (myRank === 0 || (myRank === 1 && sorted[0].score - myEntry.score <= 2)) {
            unfundedGood.push({ name: aw.name, vp: vpGain, rank: myRank + 1, myScore: myEntry.score, leaderScore: sorted[0].score });
          }
        }
        if (unfundedGood.length > 0) {
          unfundedGood.sort(function(a, b) { return b.vp - a.vp; });
          html += '<div class="tm-adv-race-title">Потенциал наград</div>';
          for (const uf of unfundedGood) {
            const color = uf.vp >= 5 ? '#2ecc71' : uf.vp >= 2 ? '#f1c40f' : '#888';
            html += '<div style="font-size:11px;padding:1px 0;color:' + color + '">';
            html += escHtml(uf.name) + ': +' + uf.vp + ' VP (позиция #' + uf.rank + ', счёт ' + uf.myScore + ')';
            html += ' — ' + costs[funded] + ' MC';
            html += '</div>';
          }
          hasContent = true;
        }
      }
    }

    // Award funding cost
    if (pv && pv.game && pv.game.awards) {
      const funded = pv.game.awards.filter(function(a) { return a.playerName || a.color; }).length;
      const costs = [8, 14, 20];
      const nextCost = funded < 3 ? costs[funded] : null;
      const msClaimed = pv.game.milestones ? pv.game.milestones.filter(function(m) { return m.playerName || m.color; }).length : 0;
      html += '<div style="font-size:11px;color:#888;margin-top:4px;padding-top:4px;border-top:1px solid #333">';
      html += 'Вехи: ' + msClaimed + '/3 заявлены | ';
      html += 'Награды: ' + funded + '/3 профинан.';
      if (nextCost) html += ' (след. ' + nextCost + ' MC)';
      html += '</div>';
      hasContent = true;
    }

    html += '<div class="tm-adv-hint">M — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  function toggleAdvisor() {
    advisorVisible = !advisorVisible;
    savePanelState();
    updateAdvisor();
  }

  // ── Toast notification system ──

  const toastQueue = [];
  let toastActive = false;
  let toastEl = null;

  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'tm-toast';
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(msg, type) {
    toastQueue.push({ msg, type: type || 'info' });
    if (!toastActive) drainToastQueue();
  }

  function drainToastQueue() {
    if (toastQueue.length === 0) { toastActive = false; return; }
    toastActive = true;
    const { msg, type } = toastQueue.shift();
    const el = ensureToast();
    el.textContent = msg;
    el.className = 'tm-toast tm-toast-' + type + ' tm-toast-show';
    setTimeout(() => {
      el.classList.remove('tm-toast-show');
      setTimeout(drainToastQueue, 300);
    }, 2500);
  }

  // Track what we already notified about to avoid spam
  const notifiedCombos = new Set();
  const notifiedMilestones = new Set();

  function checkToastTriggers() {
    if (!enabled) return;

    // 1. Godmode/great combo alerts
    if (typeof TM_COMBOS !== 'undefined') {
      const visibleNames = new Set();
      document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        visibleNames.add(el.getAttribute('data-tm-card'));
      });
      for (const combo of TM_COMBOS) {
        if (combo.r !== 'godmode' && combo.r !== 'great') continue;
        const matched = combo.cards.filter((c) => visibleNames.has(c));
        if (matched.length >= 2) {
          const key = combo.cards.sort().join('+');
          if (!notifiedCombos.has(key)) {
            notifiedCombos.add(key);
            const label = combo.r === 'godmode' ? 'БОГОМОД' : 'Отличное';
            showToast(label + ' комбо: ' + combo.v, combo.r === 'godmode' ? 'godmode' : 'great');
          }
        }
      }
    }

    // 2. Corp synergy card in draft
    const myCorp = detectMyCorp();
    if (myCorp) {
      const selectCards = document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]');
      selectCards.forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;
        const data = TM_RATINGS[name];
        if (data && data.y && data.y.some((syn) => syn === myCorp)) {
          const nKey = 'syn-' + name;
          if (!notifiedCombos.has(nKey)) {
            notifiedCombos.add(nKey);
            showToast('Синергия с корпорацией: ' + ruName(name), 'synergy');
          }
        }
      });
    }

    // 3. Milestone claimable notification
    const pv = getPlayerVueData();
    if (pv && pv.game && pv.game.milestones && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      for (const ms of pv.game.milestones) {
        if (ms.color || ms.playerName) continue; // already claimed
        if (ms.scores) {
          const myMs = ms.scores.find(function(s) { return s.color === myColor; });
          if (myMs && myMs.claimable) {
            const nKey = 'ms-claim-' + ms.name;
            if (!notifiedCombos.has(nKey)) {
              notifiedCombos.add(nKey);
              showToast('Веха доступна: ' + ms.name + '! (8 MC)', 'great');
            }
          }
        }
      }
    }

    // 4. Plant/Heat conversion ready
    if (pv && pv.thisPlayer) {
      const plants = pv.thisPlayer.plants || 0;
      const plantsNeeded = pv.thisPlayer.plantsNeededForGreenery || 8;
      if (plants >= plantsNeeded) {
        const nKey = 'plants-ready-' + detectGeneration();
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🌿 Хватает растений на озеленение! (' + plants + '/' + plantsNeeded + ')', 'info');
        }
      }
      const heat = pv.thisPlayer.heat || 0;
      if (heat >= 8) {
        const nKey = 'heat-ready-' + detectGeneration();
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('🔥 Хватает тепла на +1°C! (' + heat + '/8)', 'info');
        }
      }
    }

    // 5. Opponent played S-tier card
    if (pv && pv.players && pv.thisPlayer) {
      for (const opp of pv.players) {
        if (opp.color === pv.thisPlayer.color) continue;
        const color = opp.color;
        if (oppRecentPlays[color]) {
          for (const rp of oppRecentPlays[color]) {
            if (rp.tier === 'S') {
              const nKey = 'opp-s-' + color + '-' + rp.name;
              if (!notifiedCombos.has(nKey)) {
                notifiedCombos.add(nKey);
                showToast('⚠ ' + (opp.name || color) + ' сыграл S-tier: ' + ruName(rp.name), 'synergy');
              }
            }
          }
        }
      }
    }

    // 6. Card pool depletion
    {
      const totalCards = Object.keys(TM_RATINGS).length;
      const seenPct = totalCards > 0 ? Math.round(seenCards.size / totalCards * 100) : 0;
      if (seenPct >= 70) {
        let unseenSA = 0;
        for (const cn in TM_RATINGS) {
          if (!seenCards.has(cn) && (TM_RATINGS[cn].t === 'S' || TM_RATINGS[cn].t === 'A')) unseenSA++;
        }
        const nKey = 'pool-depleted-' + seenPct;
        if (!notifiedCombos.has(nKey)) {
          notifiedCombos.add(nKey);
          showToast('📊 Пул: ' + seenPct + '% карт увидены. Осталось ' + unseenSA + ' S/A карт', 'info');
        }
      }
    }

    // 7. Panic mode — falling behind significantly
    if (pv && pv.players && pv.thisPlayer) {
      const gen = detectGeneration();
      if (gen >= 4) {
        const myTR = pv.thisPlayer.terraformRating || 0;
        let maxOppTR = 0;
        for (const opp of pv.players) {
          if (opp.color === pv.thisPlayer.color) continue;
          const oppTR = opp.terraformRating || 0;
          if (oppTR > maxOppTR) maxOppTR = oppTR;
        }
        const gap = maxOppTR - myTR;
        if (gap >= 8) {
          const nKey = 'panic-gen-' + gen;
          if (!notifiedCombos.has(nKey)) {
            notifiedCombos.add(nKey);
            const hint = gap >= 15 ? 'Фокус на VP-карты и стандартные проекты!'
              : gap >= 10 ? 'Нужно ускорить TR — стандартные проекты и конвертации'
              : 'Отставание от лидера — наращивай TR';
            showToast('📉 Отставание: −' + gap + ' TR от лидера. ' + hint, 'info');
          }
        }
      }
    }
  }

  // ── Draft recommendation engine ──

  function getMyTableauNames() {
    const names = [];
    document.querySelectorAll('.player_home_block--cards .card-container[data-tm-card]').forEach((el) => {
      const n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    return names;
  }

  function getMyHandNames() {
    const names = [];
    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach((el) => {
      const n = el.getAttribute('data-tm-card');
      if (n) names.push(n);
    });
    return names;
  }

  // ── Player context for draft scoring ──

  // Corporation tag discounts (corp name → { tag: discount })
  // Only COST REDUCTIONS — triggers that give resources/production go to TAG_TRIGGERS
  const CORP_DISCOUNTS = {
    'Teractor': { earth: 3 },
    'Cheung Shing MARS': { building: 2 },
    'Thorgate': { power: 3 },
    'Terralabs': { _all: 1 },       // 1 MC buy cost instead of 3 → ~1 MC effective discount
    'Polaris': { _ocean: 2 },       // -2 MC on cards that place oceans (niche)
    'Inventrix': { _req: 2 },       // +/-2 on global requirements → effectively cheaper cards
  };

  // Cards that provide tag discounts (card name → { tag: discount })
  const CARD_DISCOUNTS = {
    'Earth Office': { earth: 3 },
    'Mass Converter': { space: 2 },
    'Space Station': { space: 2 },
    'Research Outpost': { _all: 1 },
    'Cutting Edge Technology': { _req: 2 },
    'Anti-Gravity Technology': { _all: 2 },
    'Earth Catapult': { _all: 2 },
    'Quantum Extractor': { space: 2 },
    'Shuttles': { space: 2 },
    'Warp Drive': { space: 4 },
    'Sky Docks': { _all: 1 },
    'Mercurian Alliances': { _all: 2 },  // 2 Wild tags — approximated as general discount
    'Dirigibles': { venus: 2 },
  };

  // Tag triggers: card/corp name → array of { tags: [...], value: N, desc: string }
  // value = approximate MC value of the trigger firing once
  const TAG_TRIGGERS = {
    // ── Science triggers ──
    'Olympus Conference': [{ tags: ['science'], value: 4, desc: 'Olympus Conf → карта' }],
    'Mars University': [{ tags: ['science'], value: 3, desc: 'Mars Uni → обмен' }],
    'Crescent Research': [{ tags: ['science'], value: 1, desc: 'Cresc Res → +1 MC' }],

    // ── Earth triggers ──
    'Point Luna': [{ tags: ['earth'], value: 4, desc: 'Point Luna → карта' }],
    'Luna Mining': [{ tags: ['earth'], value: 4, desc: 'Luna Mining → +1 ti-прод' }],

    // ── Event triggers ──
    'Media Group': [{ tags: ['event'], value: 3, desc: 'Media Group → +3 MC' }],
    'Interplanetary Cinematics': [{ tags: ['event'], value: 2, desc: 'IC → +2 MC' }],

    // ── Jovian triggers ──
    'Saturn Systems': [{ tags: ['jovian'], value: 4, desc: 'Saturn Sys → +1 MC-прод' }],
    'Titan Floating Launch-Pad': [{ tags: ['jovian'], value: 2, desc: 'Titan FLP → флоатер' }],

    // ── Microbe triggers ──
    'Splice': [{ tags: ['microbe'], value: 2, desc: 'Splice → +2 MC' }],

    // ── Animal/Plant/Bio triggers ──
    'Arklight': [
      { tags: ['animal'], value: 5, desc: 'Arklight → +1 MC-прод' },
      { tags: ['plant'], value: 5, desc: 'Arklight → +1 MC-прод' },
    ],
    'Decomposers': [
      { tags: ['animal'], value: 2, desc: 'Decomp → ресурс' },
      { tags: ['plant'], value: 2, desc: 'Decomp → ресурс' },
      { tags: ['microbe'], value: 2, desc: 'Decomp → ресурс' },
    ],
    'Meat Industry': [{ tags: ['animal'], value: 2, desc: 'Meat Ind → +2 MC' }],
    'Ecological Zone': [
      { tags: ['animal'], value: 1, desc: 'Eco Zone → VP' },
      { tags: ['plant'], value: 1, desc: 'Eco Zone → VP' },
    ],
    'Viral Enhancers': [
      { tags: ['animal'], value: 1, desc: 'Viral Enh → растение' },
      { tags: ['plant'], value: 1, desc: 'Viral Enh → растение' },
      { tags: ['microbe'], value: 1, desc: 'Viral Enh → растение' },
    ],

    // ── Building triggers ──
    'Recyclon': [{ tags: ['building'], value: 1, desc: 'Recyclon → микроб' }],

    // ── City triggers ──
    'Immigrant Community': [{ tags: ['city'], value: 3, desc: 'Immig Comm → +1 MC-прод' }],

    // ── Space event refund ──
    'Optimal Aerobraking': [{ tags: ['space'], value: 3, desc: 'Opt Aero → +3 MC/тепло' }],
  };

  // Keywords for detecting production/VP cards in the card description
  const PROD_KEYWORDS = ['прод', 'prod', 'production', 'increase'];
  const VP_KEYWORDS = ['VP', 'vp', 'ПО', 'victory point'];

  // Take-that cards: 3P context warnings
  const TAKE_THAT_CARDS = {
    'Hackers': 'Отнимает MC-прод у оппонента — третий игрок выигрывает бесплатно',
    'Energy Tapping': 'Отнимает energy-прод + теряешь 1 VP',
    'Biomass Combustors': 'Отнимает plant-прод у оппонента',
    'Predators': 'Убирает animal у оппонента каждый ход',
    'Ants': 'Убирает microbe у оппонента каждый ход',
    'Virus': 'Убирает до 5 растений у оппонента',
    'Flooding': 'Занимает тайл оппонента',
    'Mining Strike': 'Отнимает steel-прод',
    'Power Supply Consortium': 'Отнимает energy-прод у оппонента',
    'Great Escarpment Consortium': 'Отнимает steel-прод у оппонента',
    'Hired Raiders': 'Крадёт steel или MC у оппонента',
    'Sabotage': 'Отнимает titanium/steel/MC у оппонента',
    'Asteroid Mining Consortium': 'Отнимает ti-прод у оппонента',
    'Comet': 'Убирает до 3 растений у оппонента',
    'Giant Ice Asteroid': 'Убирает до 6 растений у оппонента',
    'Deimos Down': 'Убирает до 8 растений у оппонента',
  };

  // Cards that accept animal/microbe resource placement
  const ANIMAL_TARGETS = [
    'Birds', 'Fish', 'Livestock', 'Predators', 'Small Animals', 'Pets',
    'Ecological Zone', 'Penguins', 'Marine Apes', 'Security Fleet',
    'Venusian Animals', 'Venusian Insects', 'Stratospheric Birds',
    'Directed Impactors', 'Ants', 'Tardigrades', 'Extremophiles',
    'Aerosport Tournament', 'Jupiter Floating Station',
  ];
  const MICROBE_TARGETS = [
    'Decomposers', 'Ants', 'Tardigrades', 'Extremophiles',
    'Nitrite Reducing Bacteria', 'GHG Producing Bacteria', 'Psychrophiles',
    'Sulphur-Eating Bacteria', 'Thermophiles', 'Viral Enhancers',
    'Topsoil Contract', 'Recyclon',
  ];

  // Cards that place animals/microbes on OTHER cards
  const ANIMAL_PLACERS = [
    'Large Convoy', 'Imported Nitrogen', 'Imported Hydrogen',
    'Local Shading', 'Herbivores', 'Bio Printing Facility',
  ];
  const MICROBE_PLACERS = [
    'Imported Nitrogen', 'Imported Hydrogen', 'Local Shading',
    'Sponsored Academies', 'Bio Printing Facility',
  ];

  // Tag → which milestone/award it contributes to (tag: [{name, type, tag}])
  // Built from MA_DATA at init
  const TAG_TO_MA = {};
  for (const [maName, ma] of Object.entries(MA_DATA)) {
    if (ma.check === 'tags' && ma.tag) {
      if (!TAG_TO_MA[ma.tag]) TAG_TO_MA[ma.tag] = [];
      TAG_TO_MA[ma.tag].push({ name: maName, type: ma.type, target: ma.target || 0 });
    }
    if (ma.check === 'bioTags') {
      for (const bt of ['plant', 'microbe', 'animal']) {
        if (!TAG_TO_MA[bt]) TAG_TO_MA[bt] = [];
        TAG_TO_MA[bt].push({ name: maName, type: ma.type, target: ma.target || 0, bio: true });
      }
    }
  }

  function getPlayerContext() {
    const pv = getPlayerVueData();
    const gen = detectGeneration();
    let gensLeft = Math.max(1, 9 - gen);
    // Better gensLeft estimate based on remaining global param raises
    if (pv && pv.game) {
      const g = pv.game;
      const tempLeft = g.temperature != null ? Math.max(0, (8 - g.temperature) / 2) : 0;
      const oxyLeft = g.oxygenLevel != null ? Math.max(0, 14 - g.oxygenLevel) : 0;
      const oceanLeft = g.oceans != null ? Math.max(0, 9 - g.oceans) : 0;
      const totalRaises = tempLeft + oxyLeft + oceanLeft;
      // ~3 raises per gen (2 player actions + 1 WGT in 3P)
      const paramBasedGL = Math.ceil(totalRaises / 3);
      gensLeft = Math.max(1, Math.min(gensLeft, paramBasedGL));
    }
    const myCorp = detectMyCorp();

    const ctx = {
      gen: gen,
      gensLeft: gensLeft,
      tags: {},
      discounts: {},
      tagTriggers: [],
      mc: 0,
      steel: 0,
      steelVal: 2,
      titanium: 0,
      tiVal: 3,
      heat: 0,
      colonies: 0,
      prod: { mc: 0, steel: 0, ti: 0, plants: 0, energy: 0, heat: 0 },
      tr: 0,
      // Milestone/Award context
      activeMA: [],       // [{name, type, check, tag, target, current, pct}]
      milestoneNeeds: {},  // tag → how many more needed for closest milestone
      awardTags: {},       // tag → true if tag-based award is active
      // Resource targets in tableau
      animalTargets: 0,
      microbeTargets: 0,
      tableauNames: new Set(),
    };

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;

      // Resources
      ctx.mc = p.megaCredits || 0;
      ctx.steel = p.steel || 0;
      ctx.steelVal = p.steelValue || 2;
      ctx.titanium = p.titanium || 0;
      ctx.tiVal = p.titaniumValue || 3;
      ctx.heat = p.heat || 0;
      ctx.tr = p.terraformRating || 0;

      // Production
      ctx.prod.mc = p.megaCreditProduction || 0;
      ctx.prod.steel = p.steelProduction || 0;
      ctx.prod.ti = p.titaniumProduction || 0;
      ctx.prod.plants = p.plantProduction || 0;
      ctx.prod.energy = p.energyProduction || 0;
      ctx.prod.heat = p.heatProduction || 0;

      // Colonies
      ctx.colonies = p.coloniesCount || 0;

      // Tags
      if (p.tags) {
        for (const t of p.tags) {
          const tagName = (t.tag || '').toLowerCase();
          if (tagName && t.count > 0) ctx.tags[tagName] = t.count;
        }
      }

      // Corp discounts
      if (myCorp && CORP_DISCOUNTS[myCorp]) {
        const cd = CORP_DISCOUNTS[myCorp];
        for (const tag in cd) {
          ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
        }
      }

      // Card discounts + tag triggers + resource targets from tableau
      if (p.tableau) {
        for (const card of p.tableau) {
          const cname = card.name || card;
          ctx.tableauNames.add(cname);
          if (ANIMAL_TARGETS.includes(cname)) ctx.animalTargets++;
          if (MICROBE_TARGETS.includes(cname)) ctx.microbeTargets++;
        }
      }

      for (const cardName in CARD_DISCOUNTS) {
        if (ctx.tableauNames.has(cardName)) {
          const cd = CARD_DISCOUNTS[cardName];
          for (const tag in cd) {
            ctx.discounts[tag] = (ctx.discounts[tag] || 0) + cd[tag];
          }
        }
      }

      for (const cardName in TAG_TRIGGERS) {
        if (ctx.tableauNames.has(cardName) || cardName === myCorp) {
          for (const trigger of TAG_TRIGGERS[cardName]) {
            ctx.tagTriggers.push(trigger);
          }
        }
      }

      // Milestone/Award proximity
      const activeNames = detectActiveMA();
      for (const [maName, ma] of Object.entries(MA_DATA)) {
        if (activeNames.length > 0 && !activeNames.some((n) => n.includes(maName))) continue;

        let current = 0;
        if (ma.check === 'tags' && ma.tag) {
          current = ctx.tags[ma.tag] || 0;
        } else if (ma.check === 'bioTags') {
          current = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
        } else if (ma.check === 'prod' && ma.resource) {
          current = ctx.prod[ma.resource] || ctx.prod[ma.resource === 'megacredits' ? 'mc' : ma.resource] || 0;
        } else if (ma.check === 'tr') {
          current = ctx.tr;
        } else {
          continue;
        }

        const target = ma.target || 0;
        const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        ctx.activeMA.push({ name: maName, type: ma.type, check: ma.check, tag: ma.tag, target, current, pct });

        // Milestone tag proximity: how many more tags needed?
        if (ma.type === 'milestone' && ma.check === 'tags' && ma.tag && target > 0) {
          const need = target - current;
          if (need > 0 && need <= 3) {
            const prev = ctx.milestoneNeeds[ma.tag];
            if (prev === undefined || need < prev) {
              ctx.milestoneNeeds[ma.tag] = need;
            }
          }
        }
        // Ecologist: bio tags for milestone
        if (ma.type === 'milestone' && ma.check === 'bioTags' && target > 0) {
          const bioCount = (ctx.tags['plant'] || 0) + (ctx.tags['microbe'] || 0) + (ctx.tags['animal'] || 0);
          const need = target - bioCount;
          if (need > 0 && need <= 3) {
            for (const bt of ['plant', 'microbe', 'animal']) {
              const prev = ctx.milestoneNeeds[bt];
              if (prev === undefined || need < prev) {
                ctx.milestoneNeeds[bt] = need;
              }
            }
          }
        }

        // Award: mark tag-based awards as active
        if (ma.type === 'award' && ma.check === 'tags' && ma.tag) {
          ctx.awardTags[ma.tag] = true;
        }
      }
    }

    // Global parameters
    ctx.globalParams = { temp: -30, oxy: 0, oceans: 0, venus: 0 };
    if (pv && pv.game) {
      const g = pv.game;
      if (g.temperature != null) ctx.globalParams.temp = g.temperature;
      if (g.oxygenLevel != null) ctx.globalParams.oxy = g.oxygenLevel;
      if (g.oceans != null) ctx.globalParams.oceans = g.oceans;
      if (g.venusScaleLevel != null) ctx.globalParams.venus = g.venusScaleLevel;
    }

    return ctx;
  }

  function scoreDraftCard(cardName, myTableau, myHand, myCorp, cardEl, ctx) {
    const data = TM_RATINGS[cardName];
    if (!data) return { total: 0, reasons: [] };

    let bonus = 0;
    const reasons = [];

    // Base score (normalized 0-10 scale from the 0-100 tier score)
    const baseScore = data.s;

    // Corp synergy bonus (+8)
    if (myCorp && data.y && data.y.some((syn) => syn === myCorp || syn.includes(myCorp))) {
      bonus += 8;
      reasons.push('Синергия с корп.');
    }

    // Reverse: does my corp synergize with this card?
    if (myCorp) {
      const corpData = TM_RATINGS[myCorp];
      if (corpData && corpData.y && corpData.y.includes(cardName)) {
        bonus += 5;
        reasons.push('Нужна корпорации');
      }
    }

    // Synergy with tableau cards (+3 each, max +9)
    const allMyCards = [...myTableau, ...myHand];
    let synCount = 0;
    if (data.y) {
      for (const syn of data.y) {
        if (allMyCards.includes(syn) && synCount < 3) {
          synCount++;
          bonus += 3;
        }
      }
    }
    // Also check if any of my cards list this card as synergy
    for (const myCard of allMyCards) {
      const myData = TM_RATINGS[myCard];
      if (myData && myData.y && myData.y.includes(cardName) && synCount < 3) {
        synCount++;
        bonus += 3;
      }
    }
    if (synCount > 0) reasons.push(synCount + ' синерг.');

    // Combo potential with completion rate
    if (typeof TM_COMBOS !== 'undefined') {
      let bestComboBonus = 0;
      let bestComboDesc = '';
      for (const combo of TM_COMBOS) {
        if (!combo.cards.includes(cardName)) continue;
        const otherCards = combo.cards.filter((c) => c !== cardName);
        const matchCount = otherCards.filter((c) => allMyCards.includes(c)).length;
        if (matchCount === 0) continue;

        const baseBonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
        const completionRate = (matchCount + 1) / combo.cards.length;
        let comboBonus = Math.round(baseBonus * (1 + completionRate));

        // Gen-aware timing: action combos scale with gensLeft, prod combos bad late
        if (ctx) {
          let timingMul = 1.0;
          if (ctx.gensLeft !== undefined) {
            const cardIsBlue = (data.e && data.e.toLowerCase().includes('action'));
            if (cardIsBlue) {
              timingMul = ctx.gensLeft >= 5 ? 1.3 : ctx.gensLeft >= 3 ? 1.0 : 0.7;
            }
            if (data.e && PROD_KEYWORDS.some((kw) => data.e.toLowerCase().includes(kw))) {
              timingMul = ctx.gensLeft >= 5 ? 1.2 : ctx.gensLeft >= 3 ? 1.0 : 0.5;
            }
          }
          comboBonus = Math.round(comboBonus * timingMul);
        }

        if (comboBonus > bestComboBonus) {
          bestComboBonus = comboBonus;
          bestComboDesc = combo.v + ' (' + (matchCount + 1) + '/' + combo.cards.length + ')';
        }
      }
      if (bestComboBonus > 0) {
        bonus += bestComboBonus;
        reasons.push('Комбо: ' + bestComboDesc);
      }
    }

    // Anti-combo penalty
    if (typeof TM_ANTI_COMBOS !== 'undefined') {
      for (const anti of TM_ANTI_COMBOS) {
        if (!anti.cards.includes(cardName)) continue;
        const otherCards = anti.cards.filter((c) => c !== cardName);
        if (otherCards.some((c) => allMyCards.includes(c))) {
          bonus -= 3;
          reasons.push('Конфликт: ' + anti.v);
          break;
        }
      }
    }

    // ── Context-aware scoring (requires ctx and optionally cardEl) ──
    if (ctx) {
      // Detect card tags from DOM
      let cardTags = new Set();
      if (cardEl) {
        cardTags = getCardTags(cardEl);
      }

      // Detect card cost from DOM
      let cardCost = null;
      if (cardEl) {
        cardCost = getCardCost(cardEl);
      }

      // Detect card type: blue (active/action), red (event), green (automated)
      let cardType = 'green';
      if (cardEl) {
        if (cardEl.classList.contains('card-type--active') ||
            cardEl.querySelector('.card-content--blue, .blue-action, [class*="blue"]')) {
          cardType = 'blue';
        } else if (cardTags.has('event') ||
                   cardEl.classList.contains('card-type--event') ||
                   cardEl.querySelector('.card-content--red')) {
          cardType = 'red';
        }
      } else if (cardTags.has('event')) {
        cardType = 'red';
      } else if (data.e && data.e.toLowerCase().includes('action')) {
        cardType = 'blue';
      }

      // 1. Tag discounts from corp/cards
      if (cardCost != null && cardTags.size > 0) {
        let totalDiscount = 0;
        const allDiscount = ctx.discounts['_all'] || 0;
        if (allDiscount > 0) totalDiscount += allDiscount;

        for (const tag of cardTags) {
          if (ctx.discounts[tag]) {
            totalDiscount += ctx.discounts[tag];
          }
        }

        // Cap discount at card cost
        totalDiscount = Math.min(totalDiscount, cardCost);
        if (totalDiscount >= 2) {
          const discountBonus = Math.min(7, totalDiscount);
          bonus += discountBonus;
          reasons.push('Скидка −' + totalDiscount + ' MC');
        }
      }

      // 2. Steel payment (building tag)
      if (cardTags.has('building') && ctx.steel > 0) {
        const steelMC = Math.min(ctx.steel, cardCost != null ? Math.ceil(cardCost / ctx.steelVal) : ctx.steel) * ctx.steelVal;
        const steelBonus = Math.min(5, Math.round(steelMC / 3));
        if (steelBonus > 0) {
          bonus += steelBonus;
          reasons.push('Сталь −' + steelMC + ' MC');
        }
      }

      // 3. Titanium payment (space tag)
      if (cardTags.has('space') && ctx.titanium > 0) {
        const tiMC = Math.min(ctx.titanium, cardCost != null ? Math.ceil(cardCost / ctx.tiVal) : ctx.titanium) * ctx.tiVal;
        const tiBonus = Math.min(7, Math.round(tiMC / 3));
        if (tiBonus > 0) {
          bonus += tiBonus;
          reasons.push('Титан −' + tiMC + ' MC');
        }
      }

      // 4. Tag triggers from tableau cards
      if (cardTags.size > 0 && ctx.tagTriggers.length > 0) {
        let triggerTotal = 0;
        const triggerDescs = [];
        for (const trigger of ctx.tagTriggers) {
          for (const trigTag of trigger.tags) {
            if (cardTags.has(trigTag)) {
              triggerTotal += trigger.value;
              triggerDescs.push(trigger.desc);
              break; // one trigger per trigger source per card
            }
          }
        }
        if (triggerTotal > 0) {
          bonus += Math.min(12, triggerTotal);
          reasons.push(triggerDescs.slice(0, 2).join(', '));
        }
      }

      // 5. Tag density bonus (4+ of same tag → new card with that tag is more valuable)
      if (cardTags.size > 0) {
        let bestDensity = 0;
        let bestTag = '';
        for (const tag of cardTags) {
          const count = ctx.tags[tag] || 0;
          if (count >= 4 && count > bestDensity) {
            bestDensity = count;
            bestTag = tag;
          }
        }
        if (bestDensity >= 4) {
          const densityBonus = bestDensity >= 6 ? 4 : bestDensity >= 5 ? 3 : 2;
          bonus += densityBonus;
          reasons.push(bestTag + ' ×' + bestDensity);
        }
      }

      // 6. Colony synergy (cards with colony/trade keywords)
      if (ctx.colonies > 0 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('colon') || eLower.includes('trade') || eLower.includes('колон') || eLower.includes('торгов')) {
          const colonyBonus = Math.min(9, ctx.colonies * 3);
          bonus += colonyBonus;
          reasons.push(ctx.colonies + ' колон. → +' + colonyBonus);
        }
      }

      // FTN timing delta (replaces crude factors #7, #8, #17, #18, #21 when data available)
      let skipCrudeTiming = false;
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx) {
          const REFERENCE_GL = 5;
          const SCALE = 1.5;
          // If card has minG (earliest play gen due to requirements), cap both effective and reference GL
          const maxGL = fx.minG ? Math.max(0, 9 - fx.minG) : 13;
          const effectiveGL = Math.min(ctx.gensLeft, maxGL);
          const refGL = Math.min(REFERENCE_GL, maxGL);
          const delta = computeCardValue(fx, effectiveGL) - computeCardValue(fx, refGL);
          const adj = Math.max(-15, Math.min(15, Math.round(delta * SCALE)));
          if (Math.abs(adj) >= 1) {
            bonus += adj;
            reasons.push('Тайминг ' + (adj > 0 ? '+' : '') + adj);
          }
          skipCrudeTiming = true;
        }
      }

      // 7. Early production bonus (gen 1-4)
      if (!skipCrudeTiming && ctx.gen <= 4 && data.e) {
        const eLower = data.e.toLowerCase();
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isProd) {
          bonus += 3;
          reasons.push('Ранняя прод.');
        }
      }

      // 8. Late VP bonus (gen 8+)
      if (!skipCrudeTiming && ctx.gen >= 8 && data.e) {
        const eLower = data.e.toLowerCase();
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isVP && !isProd) {
          bonus += 4;
          reasons.push('Поздний VP');
        }
      }

      // 9. Milestone proximity — card tag helps reach a milestone (1-3 tags away = 5 VP)
      if (cardTags.size > 0) {
        for (const tag of cardTags) {
          const need = ctx.milestoneNeeds[tag];
          if (need !== undefined) {
            // closer = more valuable: need 1 → +7, need 2 → +5, need 3 → +3
            const msBonus = need === 1 ? 7 : need === 2 ? 5 : 3;
            bonus += msBonus;
            // Find which milestone
            const maEntries = TAG_TO_MA[tag] || [];
            const msName = maEntries.find((m) => m.type === 'milestone');
            reasons.push((msName ? msName.name : 'Веха') + ' −' + need);
            break; // one milestone bonus per card
          }
        }
      }

      // 10. Award tag positioning — card tag helps in a tag-based award
      if (cardTags.size > 0) {
        for (const tag of cardTags) {
          if (ctx.awardTags[tag]) {
            const myCount = ctx.tags[tag] || 0;
            // More valuable if we already have some tags (strengthening lead / catching up)
            const awBonus = myCount >= 4 ? 4 : myCount >= 2 ? 3 : 2;
            bonus += awBonus;
            reasons.push('Награда: ' + tag);
            break; // one award bonus per card
          }
        }
      }

      // 11. Animal placement synergy — if we have animal targets, cards that place animals are more valuable
      if (ctx.animalTargets > 0 && ANIMAL_PLACERS.includes(cardName)) {
        const apBonus = Math.min(6, ctx.animalTargets * 3);
        bonus += apBonus;
        reasons.push(ctx.animalTargets + ' жив. цель');
      }
      // Reverse: if we have animal placers and card IS an animal target
      if (ANIMAL_TARGETS.includes(cardName)) {
        let placerCount = 0;
        for (const placer of ANIMAL_PLACERS) {
          if (ctx.tableauNames.has(placer)) placerCount++;
        }
        if (placerCount > 0) {
          bonus += Math.min(5, placerCount * 3);
          reasons.push(placerCount + ' жив. плейс.');
        }
      }

      // 12. Microbe placement synergy
      if (ctx.microbeTargets > 0 && MICROBE_PLACERS.includes(cardName)) {
        const mpBonus = Math.min(5, ctx.microbeTargets * 2);
        bonus += mpBonus;
        reasons.push(ctx.microbeTargets + ' мик. цель');
      }
      if (MICROBE_TARGETS.includes(cardName)) {
        let placerCount = 0;
        for (const placer of MICROBE_PLACERS) {
          if (ctx.tableauNames.has(placer)) placerCount++;
        }
        if (placerCount > 0) {
          bonus += Math.min(4, placerCount * 2);
          reasons.push(placerCount + ' мик. плейс.');
        }
      }

      // 13. Energy consumers — cards that use energy are better with high energy prod
      if (ctx.prod.energy >= 2 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('energy') || eLower.includes('энерг') || cardTags.has('power')) {
          if (eLower.includes('decrease') || eLower.includes('spend') || eLower.includes('снизь') || eLower.includes('-')) {
            const enBonus = Math.min(4, Math.floor(ctx.prod.energy / 2));
            if (enBonus > 0) {
              bonus += enBonus;
              reasons.push('Энерг: ' + ctx.prod.energy);
            }
          }
        }
      }

      // 14. Plant engine — high plant prod makes greenery-related cards better
      if (ctx.prod.plants >= 3 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('plant') || eLower.includes('greenery') || eLower.includes('раст') || eLower.includes('озелен')) {
          const plBonus = Math.min(4, Math.floor(ctx.prod.plants / 2));
          if (plBonus > 0) {
            bonus += plBonus;
            reasons.push('Раст: ' + ctx.prod.plants);
          }
        }
      }

      // 15. Heat synergy — lots of heat makes temperature cards less needed, but heat-consumers more valuable
      if (ctx.heat >= 15 && data.e) {
        const eLower = data.e.toLowerCase();
        if (eLower.includes('heat') || eLower.includes('тепл')) {
          bonus += 2;
          reasons.push('Тепло: ' + ctx.heat);
        }
      }

      // 16. Multi-tag bonus — cards with 2+ tags fire more triggers & help more M/A
      if (cardTags.size >= 2) {
        // Only give bonus if there are active triggers/awards that benefit
        let multiHits = 0;
        for (const tag of cardTags) {
          if (ctx.awardTags[tag]) multiHits++;
          if (ctx.milestoneNeeds[tag] !== undefined) multiHits++;
          for (const trigger of ctx.tagTriggers) {
            if (trigger.tags.includes(tag)) { multiHits++; break; }
          }
        }
        if (multiHits >= 2) {
          const mtBonus = Math.min(4, multiHits);
          bonus += mtBonus;
          reasons.push(cardTags.size + ' тегов');
        }
      }

      // 17. Late production penalty (gen 7+ — production cards lose value)
      if (!skipCrudeTiming && ctx.gen >= 7 && data.e) {
        const eLower = data.e.toLowerCase();
        const isProd = PROD_KEYWORDS.some((kw) => eLower.includes(kw));
        const isVP = VP_KEYWORDS.some((kw) => eLower.includes(kw));
        if (isProd && !isVP) {
          const penaltyVal = ctx.gen >= 8 ? -5 : -3;
          bonus += penaltyVal;
          reasons.push('Позд. прод. ' + penaltyVal);
        }
      }

      // 18. Action card timing — blue cards with actions scale with gensLeft
      if (!skipCrudeTiming && cardType === 'blue' && ctx.gensLeft >= 1) {
        if (ctx.gensLeft >= 6) {
          bonus += 5;
          reasons.push('Ранний action +5');
        } else if (ctx.gensLeft >= 4) {
          bonus += 3;
          reasons.push('Action +3');
        } else if (ctx.gensLeft <= 2) {
          bonus -= 4;
          reasons.push('Поздн. action −4');
        }
      }

      // 19. Event tag: does NOT persist in tableau → doesn't help tag milestones/awards
      if (cardType === 'red' && cardTags.has('event')) {
        // If card also has other tags that help milestones → reduce the milestone bonus
        // Events trigger tag triggers but don't persist for M/A counting
        let eventPenalty = 0;
        for (const tag of cardTags) {
          if (tag === 'event') continue;
          if (ctx.milestoneNeeds[tag] !== undefined) eventPenalty += 2;
          if (ctx.awardTags[tag]) eventPenalty += 1;
        }
        if (eventPenalty > 0) {
          bonus -= Math.min(4, eventPenalty);
          reasons.push('Event не в табло −' + Math.min(4, eventPenalty));
        }
      }

      // 20. Steel/Titanium PRODUCTION synergy — recurring discount over gensLeft
      if (cardTags.has('building') && ctx.prod.steel >= 2) {
        // High steel prod → building cards consistently cheaper in future
        const stProdBonus = Math.min(4, Math.floor(ctx.prod.steel / 2));
        bonus += stProdBonus;
        reasons.push('Стл.прод ' + ctx.prod.steel + '/пок');
      }
      if (cardTags.has('space') && ctx.prod.ti >= 1) {
        const tiProdBonus = Math.min(5, ctx.prod.ti * 2);
        bonus += tiProdBonus;
        reasons.push('Ti.прод ' + ctx.prod.ti + '/пок');
      }

      // 21. VP-per-resource timing — accumulator cards are better early
      if (!skipCrudeTiming && data.e) {
        const eLower = data.e.toLowerCase();
        const isAccumulator = (eLower.includes('1 vp per') || eLower.includes('1 vp за') ||
                               eLower.includes('vp per') || eLower.includes('vp за'));
        if (isAccumulator) {
          if (ctx.gensLeft >= 5) {
            bonus += 4;
            reasons.push('VP-копилка рано +4');
          } else if (ctx.gensLeft >= 3) {
            bonus += 2;
            reasons.push('VP-копилка +2');
          } else if (ctx.gensLeft <= 1) {
            bonus -= 3;
            reasons.push('VP-копилка поздно −3');
          }
        }
      }

      // 22. Affordability check — can we actually pay for this card?
      if (cardCost != null) {
        let buyingPower = ctx.mc;
        if (cardTags.has('building')) buyingPower += ctx.steel * ctx.steelVal;
        if (cardTags.has('space')) buyingPower += ctx.titanium * ctx.tiVal;
        // Apply known discounts
        let discount = ctx.discounts['_all'] || 0;
        for (const tag of cardTags) {
          discount += ctx.discounts[tag] || 0;
        }
        const effectiveCost = Math.max(0, cardCost - discount);

        if (buyingPower < effectiveCost) {
          // Can't afford now — but might be able to next gen
          const deficit = effectiveCost - buyingPower;
          if (deficit > 15) {
            bonus -= 4;
            reasons.push('Нет MC (−' + deficit + ')');
          } else if (deficit > 8) {
            bonus -= 2;
            reasons.push('Мало MC (−' + deficit + ')');
          }
        }
      }

      // 23. Stall value — cheap action cards are underrated (extra action = delay round end)
      if (cardType === 'blue' && cardCost != null && cardCost <= 8 && ctx.gensLeft >= 3) {
        bonus += 2;
        reasons.push('Столл');
      }

      // 24. No-tag penalty — cards without tags lose all synergies
      if (cardTags.size === 0 || (cardTags.size === 1 && cardTags.has('event'))) {
        bonus -= 3;
        reasons.push('Нет тегов −3');
      }

      // 25. Parameter saturation — raising a nearly-maxed param is less valuable
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && ctx.globalParams) {
          let satPenalty = 0;
          // Temperature: max +8, steps of 2
          if (fx.tmp && ctx.globalParams.temp >= 4) satPenalty += fx.tmp * 2;
          if (fx.tmp && ctx.globalParams.temp >= 8) satPenalty += fx.tmp * 3;
          // Oxygen: max 14%
          if (fx.o2 && ctx.globalParams.oxy >= 12) satPenalty += fx.o2 * 2;
          if (fx.o2 && ctx.globalParams.oxy >= 14) satPenalty += fx.o2 * 3;
          // Oceans: max 9
          if (fx.oc && ctx.globalParams.oceans >= 8) satPenalty += fx.oc * 2;
          if (fx.oc && ctx.globalParams.oceans >= 9) satPenalty += fx.oc * 5;
          // Venus: max 30%
          if (fx.vn && ctx.globalParams.venus >= 26) satPenalty += fx.vn * 2;
          if (fx.vn && ctx.globalParams.venus >= 30) satPenalty += fx.vn * 3;
          if (satPenalty > 0) {
            satPenalty = Math.min(10, satPenalty);
            bonus -= satPenalty;
            reasons.push('Параметр макс −' + satPenalty);
          }
        }
      }

      // 26. Requirements feasibility — penalty if card can't be played anytime soon
      if (typeof TM_CARD_EFFECTS !== 'undefined') {
        const fx = TM_CARD_EFFECTS[cardName];
        if (fx && fx.minG) {
          const gensUntilPlayable = Math.max(0, fx.minG - ctx.gen);
          if (gensUntilPlayable >= 3) {
            const reqPenalty = Math.min(5, gensUntilPlayable);
            bonus -= reqPenalty;
            reasons.push('Req далеко −' + reqPenalty);
          }
        }
      }
    }

    // Prelude-specific scoring
    // Detect prelude by: cardEl has no cost (.card-number missing or cost=0) AND card is in prelude selection
    const isPrelude = cardEl && (
      cardEl.closest('.wf-component--select-prelude') ||
      cardEl.classList.contains('prelude-card') ||
      (getCardCost(cardEl) === null && data.s > 0)
    );
    if (isPrelude && ctx) {
      // Gen 1 bonus: production preludes are more valuable early
      if (ctx.gen <= 1) {
        const econLower = (data.e || '').toLowerCase();
        if (econLower.includes('прод') || econLower.includes('prod') || econLower.includes('production')) {
          bonus += 4;
          reasons.push('Прод ген.1 +4');
        }
        // Immediate TR bonus
        if (econLower.includes('tr') || econLower.includes('terraform')) {
          bonus += 3;
          reasons.push('Ранний TR +3');
        }
      }
      // Tag value on prelude — gen 1 tags are very valuable
      if (cardEl) {
        const pTags = getCardTags(cardEl);
        if (pTags.size > 0 && ctx.tagTriggers) {
          let tagBonus = 0;
          for (const trigger of ctx.tagTriggers) {
            for (const tTag of (trigger.tags || [])) {
              if (pTags.has(tTag)) tagBonus += trigger.value;
            }
          }
          if (tagBonus > 0) {
            bonus += Math.min(8, tagBonus);
            reasons.push('Теги прел. +' + Math.min(8, tagBonus));
          }
        }
      }
    }

    return { total: baseScore + bonus, reasons };
  }

  function scoreToTier(score) {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  function updateDraftRecommendations() {
    if (!enabled) return;

    // Remove old recommendation overlays
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));
    document.querySelectorAll('[data-tm-reasons]').forEach((el) => el.removeAttribute('data-tm-reasons'));
    // Restore badges that were modified in previous run
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach((badge) => {
      const orig = badge.getAttribute('data-tm-original');
      badge.textContent = orig;
      badge.removeAttribute('data-tm-original');
      // Restore original tier class
      const origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) {
        badge.className = 'tm-tier-badge tm-tier-' + origTier;
        badge.removeAttribute('data-tm-orig-tier');
      }
    });

    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) return;

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandNames();
    const ctx = getPlayerContext();

    // Score each card in selection
    const scored = [];
    selectCards.forEach((section) => {
      section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;
        const result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
        scored.push({ el, name, ...result });
      });
    });

    if (scored.length === 0) return;

    // Sort by score desc
    scored.sort((a, b) => b.total - a.total);
    const bestScore = scored[0].total;

    // Update badge on every card in draft with calculated score
    scored.forEach((item) => {
      const isBest = item.total >= bestScore - 5;
      const hasBonus = item.reasons.length > 0;

      // Highlight top picks
      if (isBest && hasBonus) {
        item.el.classList.add('tm-rec-best');
      }

      // Update existing badge with calculated score
      const badge = item.el.querySelector('.tm-tier-badge');
      if (badge) {
        const origData = TM_RATINGS[item.name];
        const origTier = origData ? origData.t : 'C';
        const origScore = origData ? origData.s : 0;
        const newTier = scoreToTier(item.total);

        // Save original text for restoration
        if (!badge.hasAttribute('data-tm-original')) {
          badge.setAttribute('data-tm-original', badge.textContent);
          badge.setAttribute('data-tm-orig-tier', origTier);
        }

        // Update badge text: show base→adjusted with colored delta
        const delta = item.total - origScore;
        if (delta === 0) {
          badge.textContent = newTier + ' ' + item.total;
        } else {
          const cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
          const sign = delta > 0 ? '+' : '';
          badge.innerHTML = origTier + origScore +
            '<span class="tm-badge-arrow">\u2192</span>' +
            newTier + item.total +
            ' <span class="' + cls + '">' + sign + delta + '</span>';
        }

        // Update tier color class
        badge.className = 'tm-tier-badge tm-tier-' + newTier;
      }

      // Store reasons on card element for tooltip display
      if (item.reasons.length > 0) {
        item.el.setAttribute('data-tm-reasons', item.reasons.join('|'));
      } else {
        item.el.removeAttribute('data-tm-reasons');
      }
    });
  }

  // ── Opponent strategy tracker ──

  let oppTrackerEl = null;
  let oppTrackerVisible = false;
  const oppLastTableau = {}; // color → Set of card names
  const oppRecentPlays = {}; // color → [{name, tier, turn}] last 5 cards
  const oppTRHistory = {}; // color → [{gen, tr}]
  let lastOppTRGen = 0;

  function buildOppTracker() {
    if (oppTrackerEl) return oppTrackerEl;
    oppTrackerEl = document.createElement('div');
    oppTrackerEl.className = 'tm-opp-tracker';
    document.body.appendChild(oppTrackerEl);
    return oppTrackerEl;
  }

  function updateOppTracker() {
    if (!oppTrackerVisible || !enabled) {
      if (oppTrackerEl) oppTrackerEl.style.display = 'none';
      return;
    }

    const panel = buildOppTracker();
    const pv = getPlayerVueData();

    let opponents = [];

    if (pv && pv.players && pv.thisPlayer) {
      const myColor = pv.thisPlayer.color;
      opponents = pv.players.filter((p) => p.color !== myColor);
    }

    if (opponents.length === 0) {
      // Fallback: try DOM
      panel.style.display = 'none';
      return;
    }

    let html = '<div class="tm-opp-title">Оппоненты</div>';

    for (const opp of opponents) {
      const name = opp.name || opp.color || '?';
      const tr = opp.terraformRating || '?';
      const mc = opp.megaCredits != null ? opp.megaCredits : '?';
      const handSize = opp.cardsInHandNbr != null ? opp.cardsInHandNbr : '?';
      const tableauCount = opp.tableau ? opp.tableau.length : 0;

      // Count tags from Vue data
      const tagCounts = {};
      if (opp.tags) {
        for (const t of opp.tags) {
          const tagName = (t.tag || '').toLowerCase();
          if (tagName && t.count > 0) tagCounts[tagName] = t.count;
        }
      }

      // Analyze strategy from cards and production
      let strategyHints = [];

      if (opp.tableau && opp.tableau.length > 0) {
        const cardNames = opp.tableau.map((c) => c.name || c);
        let sCount = 0, aCount = 0;
        for (const cn of cardNames) {
          const d = TM_RATINGS[cn];
          if (d) {
            if (d.t === 'S') sCount++;
            else if (d.t === 'A') aCount++;
          }
        }
        if (sCount > 0) strategyHints.push(sCount + ' S-tier');
        if (aCount > 0) strategyHints.push(aCount + ' A-tier');
      }

      // Detect corp
      let oppCorp = '';
      if (opp.tableau) {
        for (const c of opp.tableau) {
          const cn = c.name || c;
          if (TM_RATINGS[cn] && TM_RATINGS[cn].t) continue; // project cards have tiers
          oppCorp = cn;
          break;
        }
      }
      if (oppCorp) strategyHints.push(oppCorp);

      // Strategy archetype from tags
      const sc = tagCounts.science || 0;
      const jov = tagCounts.jovian || 0;
      const sp = tagCounts.space || 0;
      const bld = tagCounts.building || 0;
      const plt = tagCounts.plant || 0;
      const ven = tagCounts.venus || 0;
      const mic = tagCounts.microbe || 0;
      const erth = tagCounts.earth || 0;

      if (sc >= 4) strategyHints.push('Science rush');
      else if (jov >= 3) strategyHints.push('Jovian');
      else if (sp >= 5) strategyHints.push('Space');
      else if (plt >= 3 || (opp.plantProduction || 0) >= 4) strategyHints.push('Plant engine');
      else if (bld >= 5) strategyHints.push('Builder');
      else if (ven >= 3) strategyHints.push('Venus');
      else if (mic >= 3) strategyHints.push('Microbe');
      else if (erth >= 3) strategyHints.push('Earth');

      // Production focus (secondary)
      if (opp.titaniumProduction >= 2) strategyHints.push('Ti:' + opp.titaniumProduction);
      if (opp.steelProduction >= 3) strategyHints.push('St:' + opp.steelProduction);
      if (opp.megaCreditProduction >= 10) strategyHints.push('MC:' + opp.megaCreditProduction);

      // Colony count
      if (opp.coloniesCount >= 2) strategyHints.push(opp.coloniesCount + ' кол.');

      // Fleet size
      if (opp.fleetSize >= 2) strategyHints.push('Флот:' + opp.fleetSize);

      // Color indicator
      const colorMap = {
        red: '#e74c3c', green: '#2ecc71', blue: '#3498db',
        yellow: '#f1c40f', black: '#555', purple: '#9b59b6',
        orange: '#e67e22', pink: '#e91e63',
      };
      const dotColor = colorMap[(opp.color || '').toLowerCase()] || '#888';

      html += '<div class="tm-opp-row">';
      html += '<div class="tm-opp-header">';
      html += '<span class="tm-opp-dot" style="background:' + dotColor + '"></span>';
      html += '<span class="tm-opp-name">' + escHtml(name) + '</span>';
      html += '<span class="tm-opp-tr">TR:' + tr + '</span>';
      // TR delta tracking
      const gen = detectGeneration();
      const oc = opp.color;
      if (!oppTRHistory[oc]) oppTRHistory[oc] = [];
      if (gen > 0 && typeof tr === 'number') {
        const lastEntry = oppTRHistory[oc][oppTRHistory[oc].length - 1];
        if (!lastEntry || lastEntry.gen !== gen) {
          oppTRHistory[oc].push({ gen: gen, tr: tr });
          if (oppTRHistory[oc].length > 15) oppTRHistory[oc].shift();
        } else {
          lastEntry.tr = tr;
        }
      }
      if (oppTRHistory[oc].length >= 2) {
        const lastH = oppTRHistory[oc][oppTRHistory[oc].length - 1];
        const prevH = oppTRHistory[oc][oppTRHistory[oc].length - 2];
        const trDelta = lastH.tr - prevH.tr;
        const trDeltaColor = trDelta > 3 ? '#f44336' : trDelta > 0 ? '#e67e22' : '#888';
        html += '<span style="font-size:10px;color:' + trDeltaColor + '"> (' + (trDelta >= 0 ? '+' : '') + trDelta + '/пок.)</span>';
      }
      html += '</div>';
      html += '<div class="tm-opp-stats">';
      html += '<span>' + mc + ' MC</span>';
      html += '<span>' + handSize + ' карт</span>';
      html += '<span>' + tableauCount + ' сыграно</span>';
      html += '</div>';

      // Tag breakdown
      const oppTagLabels = {
        building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
        venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', power: 'Энер',
        city: 'Гор', event: 'Соб'
      };
      const oppTagKeys = Object.keys(tagCounts).filter((k) => tagCounts[k] > 0 && oppTagLabels[k]);
      if (oppTagKeys.length > 0) {
        html += '<div class="tm-opp-tags">';
        for (const tk of oppTagKeys) {
          html += '<span class="tm-opp-tag">' + oppTagLabels[tk] + ':' + tagCounts[tk] + '</span>';
        }
        html += '</div>';
      }

      if (strategyHints.length > 0) {
        html += '<div class="tm-opp-hints">' + strategyHints.join(' / ') + '</div>';
      }

      // Production comparison vs me
      if (pv.thisPlayer) {
        const myP = pv.thisPlayer;
        const prodKeys = [
          { key: 'megaCreditProduction', label: 'MC', color: '#f1c40f' },
          { key: 'steelProduction', label: 'St', color: '#8b7355' },
          { key: 'titaniumProduction', label: 'Ti', color: '#888' },
          { key: 'plantProduction', label: 'Pl', color: '#4caf50' },
          { key: 'energyProduction', label: 'En', color: '#9b59b6' },
          { key: 'heatProduction', label: 'He', color: '#e67e22' },
        ];
        const diffs = [];
        for (const pk of prodKeys) {
          const myVal = myP[pk.key] || 0;
          const oppVal = opp[pk.key] || 0;
          const diff = oppVal - myVal;
          if (diff !== 0) {
            diffs.push('<span style="color:' + (diff > 0 ? '#f44336' : '#4caf50') + '">' + pk.label + (diff > 0 ? '+' : '') + diff + '</span>');
          }
        }
        if (diffs.length > 0) {
          html += '<div style="font-size:10px;color:#888;margin-top:1px">Прод. vs я: ' + diffs.join(' ') + '</div>';
        }
      }

      // VP estimation
      const oppTR = typeof tr === 'number' ? tr : 0;
      let oppGreen = 0;
      let oppCities = 0;
      if (pv.game && pv.game.spaces) {
        for (const sp of pv.game.spaces) {
          if (sp.color === opp.color) {
            if (sp.tileType === 'greenery' || sp.tileType === 1) oppGreen++;
            if (sp.tileType === 'city' || sp.tileType === 0 || sp.tileType === 'capital' || sp.tileType === 5) oppCities++;
          }
        }
      }
      // Milestone VP
      let oppMsVP = 0;
      if (pv.game && pv.game.milestones) {
        for (const ms of pv.game.milestones) {
          if (ms.color === opp.color || ms.playerColor === opp.color) oppMsVP += 5;
        }
      }
      // Real VP if available
      const oppVB = opp.victoryPointsBreakdown;
      const oppTotal = (oppVB && oppVB.total > 0) ? oppVB.total : (oppTR + oppGreen + oppCities + oppMsVP);
      const isReal = oppVB && oppVB.total > 0;

      // Delta vs me
      const myPV = pv.thisPlayer;
      const myVB = myPV ? myPV.victoryPointsBreakdown : null;
      let myTotal = 0;
      if (myVB && myVB.total > 0) {
        myTotal = myVB.total;
      } else if (myPV) {
        myTotal = (myPV.terraformRating || 0);
        if (pv.game && pv.game.spaces) {
          for (const sp of pv.game.spaces) {
            if (sp.color === myPV.color && (sp.tileType === 'greenery' || sp.tileType === 1)) myTotal++;
          }
        }
      }
      const delta = myTotal - oppTotal;
      const dSign = delta > 0 ? '+' : '';
      const dColor = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#888';

      html += '<div class="tm-opp-stats" style="margin-top:2px">';
      html += '<span style="color:#e67e22;font-weight:bold">VP~' + oppTotal + (isReal ? '' : '?') + '</span>';
      html += '<span style="color:' + dColor + ';font-weight:bold">' + dSign + delta + '</span>';
      html += '<span style="color:#888">' + oppGreen + 'O ' + oppCities + 'C' + (oppMsVP > 0 ? ' ' + (oppMsVP/5) + 'M' : '') + '</span>';
      html += '</div>';

      // Greenery/heat conversion threat
      const oppPlants = opp.plants || 0;
      const oppPlantsNeeded = opp.plantsNeededForGreenery || 8;
      const oppHeat = opp.heat || 0;
      const threats = [];
      if (oppPlants >= oppPlantsNeeded) threats.push('🌿 Озеленение (' + oppPlants + '/' + oppPlantsNeeded + ')');
      if (oppHeat >= 8) threats.push('🔥 +1°C (' + oppHeat + '/8)');
      if (threats.length > 0) {
        html += '<div style="font-size:10px;color:#ff9800;margin-top:1px">' + threats.join(' | ') + '</div>';
      }

      // Track newly played cards
      if (opp.tableau) {
        const color = opp.color;
        const currentCards = new Set(opp.tableau.map(function(c) { return c.name || c; }));
        if (!oppLastTableau[color]) oppLastTableau[color] = new Set();
        if (!oppRecentPlays[color]) oppRecentPlays[color] = [];

        for (const cn of currentCards) {
          if (!oppLastTableau[color].has(cn)) {
            const d = TM_RATINGS[cn];
            oppRecentPlays[color].push({ name: cn, tier: d ? d.t : '?', gen: detectGeneration() });
            if (oppRecentPlays[color].length > 5) oppRecentPlays[color].shift();
          }
        }
        oppLastTableau[color] = currentCards;

        // Show recent plays
        if (oppRecentPlays[color].length > 0) {
          html += '<div class="tm-opp-recent">';
          html += '<span style="color:#888;font-size:10px">Послед.: </span>';
          for (const rp of oppRecentPlays[color]) {
            const tClass = rp.tier !== '?' ? ' tm-tier-' + rp.tier : '';
            html += '<span class="tm-opp-recent-card' + tClass + '" title="' + escHtml(rp.name) + '">' + escHtml(ruName(rp.name)).substring(0, 12) + (rp.tier !== '?' ? ' (' + rp.tier + ')' : '') + '</span>';
          }
          html += '</div>';
        }
      }

      html += '</div>';
    }

    html += '<div class="tm-adv-hint">O — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Card age tracking ──

  const cardAcquiredGen = {}; // cardName → gen when first seen in hand

  function trackCardAge() {
    const gen = detectGeneration();
    if (gen <= 0) return;
    const handNames = getMyHandNames();
    for (const name of handNames) {
      if (!cardAcquiredGen[name]) cardAcquiredGen[name] = gen;
    }
    // Clean up cards no longer in hand
    for (const name in cardAcquiredGen) {
      if (!handNames.includes(name)) delete cardAcquiredGen[name];
    }
  }

  function updateCardAgeIndicators() {
    document.querySelectorAll('.tm-card-age, .tm-sell-hint').forEach((el) => el.remove());
    if (!enabled) return;

    const gen = detectGeneration();

    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      const data = TM_RATINGS[name];

      // Card age badge (2+ gens held)
      if (gen > 1) {
        const acqGen = cardAcquiredGen[name];
        if (acqGen && gen - acqGen >= 2) {
          const age = gen - acqGen;
          const badge = document.createElement('div');
          badge.className = 'tm-card-age' + (age >= 3 ? ' tm-card-stale' : '');
          badge.textContent = age + ' п.';
          badge.title = 'В руке ' + age + ' покол.' + (age >= 3 ? ' — подумай о продаже' : '');
          el.appendChild(badge);
        }
      }

      // Sell patent hint for D/F cards in late game
      if (data && (data.t === 'D' || data.t === 'F') && gen >= 5) {
        const hint = document.createElement('div');
        hint.className = 'tm-sell-hint';
        hint.textContent = '💰 Продать?';
        hint.title = data.t + '-тир (' + data.s + ') — вероятно лучше продать за 1 MC';
        el.appendChild(hint);
      }
    });
  }

  // ── Hand sort indicators ──

  let handSortActive = false;

  function updateHandSort() {
    // Remove old sort badges
    document.querySelectorAll('.tm-sort-badge').forEach((el) => el.remove());

    if (!handSortActive || !enabled) return;

    const handCards = [];
    document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      const data = name ? TM_RATINGS[name] : null;
      if (data) handCards.push({ el, name, score: data.s, tier: data.t });
    });

    if (handCards.length === 0) return;

    // Sort by score desc
    const sorted = [...handCards].sort((a, b) => b.score - a.score);

    // Assign rank
    sorted.forEach((item, idx) => {
      const badge = document.createElement('div');
      badge.className = 'tm-sort-badge';
      badge.textContent = '#' + (idx + 1);
      if (idx === 0) badge.classList.add('tm-sort-top');
      if (idx === sorted.length - 1) badge.classList.add('tm-sort-last');
      item.el.appendChild(badge);
    });
  }

  // ── Card comparison mode ──

  let compareCards = [];
  let compareEl = null;

  function addToCompare(cardName) {
    if (compareCards.includes(cardName)) return;
    compareCards.push(cardName);
    if (compareCards.length >= 2) {
      showComparison(compareCards[0], compareCards[1]);
      compareCards = [];
    } else {
      showToast('Сравнение: ' + ruName(cardName) + ' (кликни другой бейдж)', 'info');
    }
  }

  function showComparison(name1, name2) {
    const d1 = TM_RATINGS[name1];
    const d2 = TM_RATINGS[name2];
    if (!d1 || !d2) return;

    if (!compareEl) {
      compareEl = document.createElement('div');
      compareEl.className = 'tm-compare-panel';
      document.body.appendChild(compareEl);
      compareEl.addEventListener('click', (e) => {
        if (e.target === compareEl || e.target.classList.contains('tm-compare-close')) {
          compareEl.style.display = 'none';
        }
      });
    }

    const gen = detectGeneration();
    const mul = getValueMultipliers(gen);

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandNames();
    const ctx = getPlayerContext();
    const r1 = scoreDraftCard(name1, myTableau, myHand, myCorp, null, ctx);
    const r2 = scoreDraftCard(name2, myTableau, myHand, myCorp, null, ctx);

    const winner = r1.total > r2.total ? 1 : r2.total > r1.total ? 2 : 0;

    function cardHtml(name, data, result, isWinner) {
      let h = '<div class="tm-cmp-card' + (isWinner ? ' tm-cmp-winner' : '') + '">';
      h += '<div class="tm-cmp-header">';
      h += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + ' ' + data.s + '</span> ';
      h += '<span class="tm-cmp-name">' + escHtml(ruName(name)) + '</span>';
      h += '</div>';
      if (data.e) h += '<div class="tm-cmp-row">' + escHtml(data.e) + '</div>';
      if (data.w) h += '<div class="tm-cmp-row">' + escHtml(data.w) + '</div>';
      if (data.y && data.y.length && data.y[0] !== 'None significant') {
        h += '<div class="tm-cmp-row"><b>Синергии:</b> ' + data.y.map(escHtml).join(', ') + '</div>';
      }
      h += '<div class="tm-cmp-score">Оценка: ' + result.total + '</div>';
      if (result.reasons.length > 0) {
        h += '<div class="tm-cmp-reasons">' + result.reasons.join(' | ') + '</div>';
      }
      h += '</div>';
      return h;
    }

    let html = '<div class="tm-compare-inner">';
    html += '<span class="tm-compare-close">&times;</span>';
    html += '<div class="tm-compare-title">Сравнение карт (Поколение ' + gen + ')</div>';
    html += '<div class="tm-cmp-grid">';
    html += cardHtml(name1, d1, r1, winner === 1);
    html += '<div class="tm-cmp-vs">VS</div>';
    html += cardHtml(name2, d2, r2, winner === 2);
    html += '</div>';
    if (winner > 0) {
      const winName = winner === 1 ? name1 : name2;
      const diff = Math.abs(r1.total - r2.total);
      html += '<div class="tm-cmp-verdict">' + escHtml(ruName(winName)) + ' побеждает на ' + diff + ' очков</div>';
    } else {
      html += '<div class="tm-cmp-verdict">Ничья!</div>';
    }
    html += '</div>';

    compareEl.innerHTML = html;
    compareEl.style.display = 'flex';
  }

  // ── Income Projection ──

  let incomeEl = null;
  let incomeVisible = false;
  const incomeHistory = []; // [{gen, tr, mcProd, totalIncome}]
  let lastIncomeGen = 0;
  let genStartMC = -1; // MC at start of current generation

  function buildIncomePanel() {
    if (incomeEl) return incomeEl;
    incomeEl = document.createElement('div');
    incomeEl.className = 'tm-income-panel';
    document.body.appendChild(incomeEl);
    return incomeEl;
  }

  function updateIncomeProjection() {
    if (!incomeVisible || !enabled) {
      if (incomeEl) incomeEl.style.display = 'none';
      return;
    }

    const panel = buildIncomePanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      panel.style.display = 'none';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();

    // Track MC spending — record MC at start of gen
    if (gen > lastIncomeGen && gen > 0) {
      genStartMC = p.megaCredits || 0;
    }

    const cur = {
      mc: p.megaCredits || 0,
      steel: p.steel || 0,
      ti: p.titanium || 0,
      plants: p.plants || 0,
      energy: p.energy || 0,
      heat: p.heat || 0,
    };

    const prod = {
      mc: p.megaCreditProduction || 0,
      steel: p.steelProduction || 0,
      ti: p.titaniumProduction || 0,
      plants: p.plantProduction || 0,
      energy: p.energyProduction || 0,
      heat: p.heatProduction || 0,
    };

    const tr = p.terraformRating || 0;

    // Next gen: current + production. Energy resets (converts to heat).
    const next = {
      mc: cur.mc + prod.mc + tr,
      steel: cur.steel + prod.steel,
      ti: cur.ti + prod.ti,
      plants: cur.plants + prod.plants,
      energy: prod.energy,
      heat: cur.heat + cur.energy + prod.heat,
    };

    // Rough MC value of total income per gen
    const incomeValue = prod.mc + tr + prod.steel * 2 + prod.ti * 3 +
      prod.plants * 1.5 + prod.energy * 1 + prod.heat * 0.5;

    let html = '<div class="tm-income-title">Прогноз дохода</div>';
    html += '<div class="tm-income-gen">Пок. ' + gen + ' → ' + (gen + 1) + '</div>';

    const rows = [
      { name: 'MC', cur: cur.mc, prodLabel: prod.mc + '+' + tr + 'TR', next: next.mc },
      { name: 'Сталь', cur: cur.steel, prodLabel: '+' + prod.steel, next: next.steel },
      { name: 'Титан', cur: cur.ti, prodLabel: '+' + prod.ti, next: next.ti },
      { name: 'Расте', cur: cur.plants, prodLabel: '+' + prod.plants, next: next.plants },
      { name: 'Энерг', cur: cur.energy, prodLabel: '+' + prod.energy, next: next.energy },
      { name: 'Тепло', cur: cur.heat, prodLabel: '+' + prod.heat + '+' + cur.energy, next: next.heat },
    ];

    for (const r of rows) {
      html += '<div class="tm-inc-row">';
      html += '<span class="tm-inc-name">' + r.name + '</span>';
      html += '<span class="tm-inc-cur">' + r.cur + '</span>';
      html += '<span class="tm-inc-prod">' + r.prodLabel + '</span>';
      html += '<span class="tm-inc-next">' + r.next + '</span>';
      html += '</div>';
    }

    html += '<div class="tm-inc-total">Доход: ~' + Math.round(incomeValue) + ' MC/пок.</div>';
    // MC spent this generation
    if (genStartMC >= 0 && gen > 0) {
      const mcSpent = Math.max(0, genStartMC - cur.mc);
      html += '<div style="font-size:11px;color:#f39c12;padding:2px 4px">Потрачено: ' + mcSpent + ' MC (было ' + genStartMC + ', сейчас ' + cur.mc + ')</div>';
    }

    // Buying power: MC + steel for building + titanium for space
    const steelVal = p.steelValue || 2;
    const tiVal = p.titaniumValue || 3;
    const buildingPower = next.mc + next.steel * steelVal;
    const spacePower = next.mc + next.ti * tiVal;
    const maxPower = next.mc + next.steel * steelVal + next.ti * tiVal;

    html += '<div class="tm-inc-section">Покупательная сила (след. пок.)</div>';
    html += '<div class="tm-inc-buy"><span>Строит.</span><span>' + buildingPower + ' MC</span></div>';
    html += '<div class="tm-inc-buy"><span>Космос</span><span>' + spacePower + ' MC</span></div>';
    html += '<div class="tm-inc-buy"><span>Макс.</span><span>' + maxPower + ' MC</span></div>';

    // Resource efficiency — cards played vs TR/VP gained
    if (gen >= 2 && p.tableau) {
      const cardsPlayed = p.tableau.length;
      const trGained = tr - 20; // Starting TR is 20
      const ratioTR = cardsPlayed > 0 ? (trGained / cardsPlayed).toFixed(1) : '0';
      html += '<div class="tm-inc-section">Эффективность</div>';
      html += '<div class="tm-inc-buy"><span>Карт сыграно</span><span>' + cardsPlayed + '</span></div>';
      html += '<div class="tm-inc-buy"><span>TR набрано</span><span>+' + trGained + ' (от 20)</span></div>';
      html += '<div class="tm-inc-buy"><span>TR/карту</span><span>' + ratioTR + '</span></div>';
      // Income per card played
      const incPerCard = cardsPlayed > 0 ? (incomeValue / cardsPlayed).toFixed(1) : '0';
      html += '<div class="tm-inc-buy"><span>Доход/карту</span><span>' + incPerCard + ' MC</span></div>';
    }

    // Track income per generation
    if (gen > lastIncomeGen && gen > 0) {
      const totalIncome = tr + prod.mc + prod.steel * steelVal + prod.ti * tiVal;
      incomeHistory.push({ gen: gen, tr: tr, mcProd: prod.mc, totalIncome: totalIncome });
      lastIncomeGen = gen;
    }

    // Mini income graph
    if (incomeHistory.length >= 2) {
      html += '<div class="tm-inc-section">Рост дохода</div>';
      const maxInc = Math.max.apply(null, incomeHistory.map(function(h) { return h.totalIncome; }));
      html += '<div style="display:flex;align-items:flex-end;gap:2px;height:30px;margin:4px 0">';
      for (const h of incomeHistory) {
        const barH = maxInc > 0 ? Math.round((h.totalIncome / maxInc) * 28) : 1;
        html += '<div style="flex:1;height:' + Math.max(2, barH) + 'px;background:linear-gradient(#e67e22,#2ecc71);border-radius:1px" title="Пок.' + h.gen + ': ' + h.totalIncome + ' MC"></div>';
      }
      html += '</div>';
      // Delta last 2 gens
      const last = incomeHistory[incomeHistory.length - 1];
      const prev = incomeHistory[incomeHistory.length - 2];
      const incDelta = last.totalIncome - prev.totalIncome;
      html += '<div style="font-size:11px;color:#888;text-align:center">';
      html += 'Пок.' + last.gen + ': ' + last.totalIncome + ' MC';
      html += ' (<span style="color:' + (incDelta >= 0 ? '#4caf50' : '#f44336') + '">' + (incDelta >= 0 ? '+' : '') + incDelta + '</span>)';
      html += '</div>';
    }

    html += '<div class="tm-adv-hint">G — вкл/выкл</div>';

    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Card Pool Tracker ──

  let poolEl = null;
  let poolVisible = false;
  const seenCards = new Set();

  // Draft history tracking
  const draftHistory = []; // [{round, offered: [...], taken: string|null, passed: [...]}]
  let lastDraftSet = new Set();

  function trackDraftHistory() {
    const selectCards = document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]');
    if (selectCards.length === 0) {
      // No draft active — if we had cards before, the last pick was made
      if (lastDraftSet.size > 0) {
        // Detect what was taken: compare lastDraftSet with current hand
        const myHand = new Set(getMyHandNames());
        let taken = null;
        const passed = [];
        for (const name of lastDraftSet) {
          if (myHand.has(name)) {
            taken = name;
          } else {
            passed.push(name);
          }
        }
        if (taken || passed.length > 0) {
          draftHistory.push({ round: draftHistory.length + 1, offered: Array.from(lastDraftSet), taken: taken, passed: passed });
        }
        lastDraftSet = new Set();
      }
      return;
    }

    const currentSet = new Set();
    selectCards.forEach(function(el) {
      const name = el.getAttribute('data-tm-card');
      if (name) currentSet.add(name);
    });

    // Detect if cards changed (new draft round)
    if (currentSet.size > 0 && lastDraftSet.size > 0 && currentSet.size !== lastDraftSet.size) {
      // Cards changed — previous round ended
      const myHand = new Set(getMyHandNames());
      let taken = null;
      const passed = [];
      for (const name of lastDraftSet) {
        if (!currentSet.has(name)) {
          if (myHand.has(name)) taken = name;
          else passed.push(name);
        }
      }
      if (taken || passed.length > 0) {
        draftHistory.push({ round: draftHistory.length + 1, offered: Array.from(lastDraftSet), taken: taken, passed: passed });
      }
    }

    lastDraftSet = currentSet;
  }

  let lastPoolSave = 0;

  function getPoolKey() {
    return 'tm_pool_' + (location.search || location.hash || 'default');
  }

  function trackSeenCards() {
    const before = seenCards.size;
    document.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (name) seenCards.add(name);
    });
    // Auto-save to storage every 10 seconds if new cards were seen
    if (seenCards.size > before && Date.now() - lastPoolSave > 10000) {
      lastPoolSave = Date.now();
      saveSeenCards();
    }
  }

  function saveSeenCards() {
    safeStorage((storage) => {
      const obj = {};
      obj[getPoolKey()] = Array.from(seenCards);
      storage.local.set(obj);
    });
  }

  function loadSeenCards() {
    safeStorage((storage) => {
      const key = getPoolKey();
      storage.local.get(key, (result) => {
        if (result[key] && Array.isArray(result[key])) {
          for (const name of result[key]) seenCards.add(name);
        }
      });
    });
  }

  function buildPoolPanel() {
    if (poolEl) return poolEl;
    poolEl = document.createElement('div');
    poolEl.className = 'tm-pool-panel';
    document.body.appendChild(poolEl);
    return poolEl;
  }

  function updateCardPool() {
    if (!poolVisible || !enabled) {
      if (poolEl) poolEl.style.display = 'none';
      return;
    }

    const panel = buildPoolPanel();
    const totalCards = Object.keys(TM_RATINGS).length;
    const seenCount = seenCards.size;
    const unseenCount = totalCards - seenCount;

    const unseenTiers = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    const totalTiers = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const [name, data] of Object.entries(TM_RATINGS)) {
      totalTiers[data.t] = (totalTiers[data.t] || 0) + 1;
      if (!seenCards.has(name)) {
        unseenTiers[data.t] = (unseenTiers[data.t] || 0) + 1;
      }
    }

    let html = '<div class="tm-pool-title">Пул карт</div>';
    html += '<div class="tm-pool-summary">';
    html += '<span>Видели: ' + seenCount + '</span>';
    html += '<span>Осталось: ' + unseenCount + '</span>';
    html += '<span>Всего: ' + totalCards + '</span>';
    html += '</div>';

    const pct = Math.round((seenCount / totalCards) * 100);
    html += '<div class="tm-pool-bar"><div class="tm-pool-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="tm-pool-pct">' + pct + '% видели</div>';

    html += '<div class="tm-pool-tiers">';
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) {
      if (totalTiers[t] > 0) {
        const seenT = totalTiers[t] - unseenTiers[t];
        const tPct = Math.round((seenT / totalTiers[t]) * 100);
        html += '<div class="tm-pool-tier-row">';
        html += '<span class="tm-tip-tier tm-tier-' + t + '">' + t + '</span>';
        html += '<div class="tm-pool-tier-bar"><div class="tm-pool-tier-fill" style="width:' + tPct + '%;background:' + (t === 'S' ? '#e74c3c' : t === 'A' ? '#e67e22' : t === 'B' ? '#f1c40f' : '#888') + '"></div></div>';
        html += '<span class="tm-pool-tier-num">' + seenT + '/' + totalTiers[t] + ' (' + tPct + '%)</span>';
        html += '</div>';
      }
    }
    html += '</div>';

    // Draw probabilities (4 cards drawn per pick)
    if (unseenCount > 0) {
      const drawSize = 4;
      html += '<div class="tm-pool-section">Шанс при draw (' + drawSize + ' карт)</div>';
      for (const t of ['S', 'A', 'B']) {
        const n = unseenTiers[t] || 0;
        if (n === 0) continue;
        // P(at least 1 of tier T in draw of drawSize) = 1 - C(unseenCount-n, drawSize) / C(unseenCount, drawSize)
        let pNone = 1;
        for (let i = 0; i < drawSize; i++) {
          pNone *= (unseenCount - n - i) / (unseenCount - i);
        }
        const pAtLeast1 = Math.max(0, Math.min(1, 1 - pNone));
        const pctDraw = Math.round(pAtLeast1 * 100);
        html += '<div class="tm-pool-tier-row">';
        html += '<span class="tm-tip-tier tm-tier-' + t + '">' + t + '</span>';
        html += '<span class="tm-pool-tier-num">' + pctDraw + '% шанс</span>';
        html += '</div>';
      }
    }

    // Key unseen S/A cards
    const unseenGood = [];
    for (const [name, data] of Object.entries(TM_RATINGS)) {
      if (!seenCards.has(name) && (data.t === 'S' || data.t === 'A')) {
        unseenGood.push({ name, score: data.s, tier: data.t });
      }
    }
    unseenGood.sort((a, b) => b.score - a.score);

    if (unseenGood.length > 0) {
      html += '<div class="tm-pool-section">Невиданные S/A (' + unseenGood.length + ')</div>';
      html += '<div class="tm-pool-list">';
      for (const c of unseenGood.slice(0, 12)) {
        html += '<div class="tm-pool-item"><span class="tm-tip-tier tm-tier-' + c.tier + '">' + c.tier + '</span> ' + escHtml(ruName(c.name)) + '</div>';
      }
      if (unseenGood.length > 12) {
        html += '<div class="tm-pool-more">+' + (unseenGood.length - 12) + ' ещё</div>';
      }
      html += '</div>';
    }

    // Draft history — show what was passed to opponents
    if (draftHistory.length > 0) {
      const passedToOpp = [];
      for (const round of draftHistory) {
        for (const name of round.passed) {
          const data = TM_RATINGS[name];
          if (data && (data.t === 'S' || data.t === 'A' || data.t === 'B')) {
            passedToOpp.push({ name: name, tier: data.t, score: data.s, round: round.round });
          }
        }
      }
      if (passedToOpp.length > 0) {
        passedToOpp.sort(function(a, b) { return b.score - a.score; });
        html += '<div class="tm-pool-section">Ушли оппонентам (' + passedToOpp.length + ')</div>';
        html += '<div class="tm-pool-list">';
        for (const c of passedToOpp.slice(0, 8)) {
          html += '<div class="tm-pool-item"><span class="tm-tip-tier tm-tier-' + c.tier + '">' + c.tier + '</span> ' + escHtml(ruName(c.name)) + '</div>';
        }
        if (passedToOpp.length > 8) {
          html += '<div class="tm-pool-more">+' + (passedToOpp.length - 8) + ' ещё</div>';
        }
        html += '</div>';
      }
    }

    html += '<div class="tm-adv-hint">P — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Play Order Advisor ──

  let playOrderEl = null;
  let playOrderVisible = false;

  function buildPlayOrderPanel() {
    if (playOrderEl) return playOrderEl;
    playOrderEl = document.createElement('div');
    playOrderEl.className = 'tm-playorder-panel';
    document.body.appendChild(playOrderEl);
    return playOrderEl;
  }

  function analyzePlayOrder() {
    if (!playOrderVisible || !enabled) {
      if (playOrderEl) playOrderEl.style.display = 'none';
      return;
    }

    const panel = buildPlayOrderPanel();
    const handCards = getMyHandNames();

    if (handCards.length === 0) {
      panel.innerHTML = '<div class="tm-po-title">Порядок розыгрыша</div><div class="tm-pool-more">Нет карт в руке</div>';
      panel.style.display = 'block';
      return;
    }

    const gen = detectGeneration();
    const gensLeft = Math.max(1, 9 - gen);

    const scored = [];
    for (const name of handCards) {
      const data = TM_RATINGS[name];
      if (!data) continue;

      let priority = 50;
      const reasons = [];
      const econ = (data.e || '').toLowerCase();
      const when = (data.w || '').toLowerCase();

      // Production cards: play early for more generations of benefit
      if (econ.includes('prod') && !econ.includes('vp only')) {
        priority += gensLeft * 3;
        reasons.push('Продукция');
      }

      // Action cards: play early for more activations
      if (econ.includes('action') || when.includes('action')) {
        priority += gensLeft * 2;
        reasons.push('Действие');
      }

      // TR cards: moderate priority
      if (econ.includes('tr') && !econ.includes('prod')) {
        priority += 5;
        reasons.push('TR');
      }

      // Cards that enable other hand cards
      let enablesOthers = 0;
      for (const other of handCards) {
        if (other === name) continue;
        const od = TM_RATINGS[other];
        if (od && od.y && od.y.includes(name)) enablesOthers++;
      }
      if (enablesOthers > 0) {
        priority += enablesOthers * 5;
        reasons.push('Активирует ' + enablesOthers);
      }

      // Cards that need other hand cards — play after
      let needsOthers = 0;
      if (data.y) {
        for (const syn of data.y) {
          if (handCards.includes(syn)) needsOthers++;
        }
      }
      if (needsOthers > 0) {
        priority -= needsOthers * 3;
        reasons.push('После синергии');
      }

      // VP-only: low priority (no ongoing value)
      if (econ.includes('vp') && !econ.includes('prod') && !econ.includes('action')) {
        priority -= gensLeft * 2;
        reasons.push('Только VP');
      }

      scored.push({ name, priority, reasons, tier: data.t, score: data.s });
    }

    scored.sort((a, b) => b.priority - a.priority);

    let html = '<div class="tm-po-title">Порядок розыгрыша (Пок. ' + gen + ', осталось ' + gensLeft + ')</div>';

    scored.forEach((item, idx) => {
      html += '<div class="tm-po-row">';
      html += '<span class="tm-po-num">' + (idx + 1) + '</span>';
      html += '<span class="tm-tip-tier tm-tier-' + item.tier + '">' + item.tier + '</span> ';
      html += '<span class="tm-po-name">' + escHtml(ruName(item.name)) + '</span>';
      if (item.reasons.length > 0) {
        html += '<div class="tm-po-reason">' + item.reasons.join(', ') + '</div>';
      }
      html += '</div>';
    });

    html += '<div class="tm-adv-hint">Q — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Tag Counter Dashboard ──

  let tagCounterEl = null;
  let tagCounterVisible = false;

  function buildTagCounter() {
    if (tagCounterEl) return tagCounterEl;
    tagCounterEl = document.createElement('div');
    tagCounterEl.className = 'tm-tagcount-panel';
    document.body.appendChild(tagCounterEl);
    return tagCounterEl;
  }

  function updateTagCounter() {
    if (!tagCounterVisible || !enabled) {
      if (tagCounterEl) tagCounterEl.style.display = 'none';
      return;
    }

    const panel = buildTagCounter();
    const pv = getPlayerVueData();

    const tags = {};
    const prod = {};

    if (pv && pv.thisPlayer) {
      const p = pv.thisPlayer;
      if (p.tags) {
        for (const t of p.tags) {
          const name = (t.tag || '').toLowerCase();
          if (name && t.count > 0) tags[name] = t.count;
        }
      }
      prod.mc = p.megaCreditProduction || 0;
      prod.steel = p.steelProduction || 0;
      prod.ti = p.titaniumProduction || 0;
      prod.plants = p.plantProduction || 0;
      prod.energy = p.energyProduction || 0;
      prod.heat = p.heatProduction || 0;
    } else {
      panel.innerHTML = '<div class="tm-tc-title">Теги</div><div class="tm-pool-more">Данные недоступны</div>';
      panel.style.display = 'block';
      return;
    }

    let html = '<div class="tm-tc-title">Мои теги и продукция</div>';

    // Tags
    const tagOrder = ['building', 'space', 'science', 'earth', 'jovian', 'venus',
                      'plant', 'microbe', 'animal', 'power', 'city', 'event', 'mars', 'wild'];
    const tagLabels = {
      building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
      venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', power: 'Энер',
      city: 'Гор', event: 'Соб', mars: 'Мар', wild: 'Уни'
    };

    html += '<div class="tm-tc-tags">';
    for (const tag of tagOrder) {
      if (tags[tag]) {
        html += '<span class="tm-tc-tag" title="' + tag + '">';
        html += '<span class="tm-tc-tag-name">' + tagLabels[tag] + '</span>';
        html += '<span class="tm-tc-tag-count">' + tags[tag] + '</span>';
        html += '</span>';
      }
    }
    html += '</div>';

    // Production
    html += '<div class="tm-tc-prod-title">Продукция</div>';
    html += '<div class="tm-tc-prod">';
    const prodItems = [
      { name: 'MC', val: prod.mc },
      { name: 'Стл', val: prod.steel },
      { name: 'Ти', val: prod.ti },
      { name: 'Рст', val: prod.plants },
      { name: 'Энг', val: prod.energy },
      { name: 'Тпл', val: prod.heat },
    ];
    for (const pi of prodItems) {
      html += '<span class="tm-tc-prod-item">';
      html += '<span class="tm-tc-prod-name">' + pi.name + '</span>';
      html += '<span class="tm-tc-prod-val">' + pi.val + '</span>';
      html += '</span>';
    }
    html += '</div>';

    const uniqueTagCount = Object.keys(tags).length;
    html += '<div class="tm-tc-unique">Уникальных тегов: ' + uniqueTagCount + '</div>';

    html += '<div class="tm-adv-hint">D — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Draft Tag Filter ──

  let lensEl = null;
  let activeLens = null;

  function updateDraftLens() {
    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) {
      if (lensEl) lensEl.style.display = 'none';
      if (activeLens) {
        activeLens = null;
        document.querySelectorAll('.tm-lens-dim').forEach((el) => el.classList.remove('tm-lens-dim'));
      }
      return;
    }

    if (!lensEl) {
      lensEl = document.createElement('div');
      lensEl.className = 'tm-lens-bar';

      const filters = [
        { label: 'Все', key: null },
        { label: 'Стр', key: 'building' },
        { label: 'Косм', key: 'space' },
        { label: 'Нау', key: 'science' },
        { label: 'Раст', key: 'plant' },
        { label: 'Мик', key: 'microbe' },
        { label: 'Жив', key: 'animal' },
        { label: 'Зем', key: 'earth' },
        { label: 'Юпи', key: 'jovian' },
        { label: 'Вен', key: 'venus' },
        { label: 'Соб', key: 'event' },
      ];

      for (const f of filters) {
        const btn = document.createElement('button');
        btn.className = 'tm-lens-btn';
        if (!f.key) btn.classList.add('tm-lens-active');
        btn.textContent = f.label;
        btn.title = f.key || 'Показать все';
        btn.addEventListener('click', () => {
          lensEl.querySelectorAll('.tm-lens-btn').forEach((b) => b.classList.remove('tm-lens-active'));
          btn.classList.add('tm-lens-active');
          applyDraftLens(f.key);
        });
        lensEl.appendChild(btn);
      }

      document.body.appendChild(lensEl);
    }

    lensEl.style.display = 'flex';
    // Re-apply active lens to new cards
    if (activeLens) applyDraftLens(activeLens);
  }

  function applyDraftLens(tagKey) {
    activeLens = tagKey;
    document.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]').forEach((el) => {
      if (!tagKey) {
        el.classList.remove('tm-lens-dim');
        return;
      }

      // Check card DOM for tag class
      const hasTagIcon = el.querySelector('[class*="tag-' + tagKey + '"]');
      if (hasTagIcon) {
        el.classList.remove('tm-lens-dim');
        return;
      }

      // Fallback: check synergy and economy text
      const name = el.getAttribute('data-tm-card');
      const data = name ? TM_RATINGS[name] : null;
      if (data) {
        const allText = ((data.e || '') + ' ' + (data.y || []).join(' ') + ' ' + name).toLowerCase();
        if (allText.includes(tagKey)) {
          el.classList.remove('tm-lens-dim');
          return;
        }
      }

      el.classList.add('tm-lens-dim');
    });
  }

  // ── Generation Change Summary ──

  let lastSummaryGen = 0;
  let genStartTR = 0;
  let genStartTableau = 0;
  let genStartMCSnapshot = 0;

  function checkGenChange() {
    if (!enabled) return;
    const gen = detectGeneration();
    if (gen <= 0) return;

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    if (gen > lastSummaryGen && lastSummaryGen > 0) {
      // Generation changed — show summary of previous gen
      const trNow = pv.thisPlayer.terraformRating || 0;
      const tableauNow = (pv.thisPlayer.tableau || []).length;
      const trGained = trNow - genStartTR;
      const cardsPlayed = tableauNow - genStartTableau;

      showToast('Пок. ' + lastSummaryGen + ' → ' + gen + ': +' + trGained + ' TR, ' + cardsPlayed + ' карт сыграно', 'info');
    }

    if (gen !== lastSummaryGen) {
      lastSummaryGen = gen;
      genStartTR = pv.thisPlayer.terraformRating || 0;
      genStartTableau = (pv.thisPlayer.tableau || []).length;
      genStartMCSnapshot = pv.thisPlayer.megaCredits || 0;
    }
  }

  // ── Action Card Reminder ──

  let lastReminderGen = 0;
  const activatedThisGen = new Set();

  function updateActionReminder() {
    if (!enabled) return;

    const gen = detectGeneration();
    // Reset activated set when generation changes
    if (gen !== lastReminderGen) {
      activatedThisGen.clear();
      lastReminderGen = gen;
    }

    // Remove old indicators
    document.querySelectorAll('.tm-action-reminder').forEach((el) => el.remove());

    // Only show during action phase (when we see the main game board, not during draft)
    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length > 0) return; // Draft phase — skip

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    // Check which cards in our tableau are blue (active) cards with actions
    const tableauEls = document.querySelectorAll('.player_home_block--cards .card-container[data-tm-card]');

    for (const el of tableauEls) {
      const name = el.getAttribute('data-tm-card');
      if (!name || activatedThisGen.has(name)) continue;

      // Detect blue/active cards by DOM (blue background or .card-type--active class)
      const isBlue = el.classList.contains('card-type--active') ||
        el.querySelector('.card-content-wrapper[class*="blue"]') ||
        el.querySelector('.card-content--blue') ||
        el.querySelector('.blue-action');

      // Fallback: check if ratings data mentions "action" in economy
      const data = TM_RATINGS[name];
      const hasAction = isBlue || (data && data.e && data.e.toLowerCase().includes('action'));

      if (!hasAction) continue;

      // Check Vue data for activation status
      if (pv.thisPlayer.tableau) {
        for (const card of pv.thisPlayer.tableau) {
          const cn = card.name || card;
          if (cn === name && card.isDisabled) {
            activatedThisGen.add(name);
            break;
          }
        }
        if (activatedThisGen.has(name)) continue;
      }

      // Classify action priority
      let priority = 'normal';
      let actionHint = 'Действие доступно';
      if (data) {
        const eLower = (data.e || '').toLowerCase();
        if (eLower.includes('vp') || eLower.includes('animal') || eLower.includes('floater') || eLower.includes('science')) {
          priority = 'vp';
          actionHint = 'VP action — приоритет!';
        } else if (eLower.includes('mc') || eLower.includes('prod') || eLower.includes('steel') || eLower.includes('titanium')) {
          priority = 'econ';
          actionHint = 'Экономический action';
        } else if (eLower.includes('card') || eLower.includes('draw')) {
          priority = 'card';
          actionHint = 'Card draw action';
        }
      }

      // Add reminder dot with priority color
      const dot = document.createElement('div');
      dot.className = 'tm-action-reminder tm-action-' + priority;
      dot.title = actionHint;
      el.appendChild(dot);
    }
  }

  // ── Generation Timer ──

  let genStartTime = Date.now();
  let gameStartTime = Date.now();
  let lastTrackedGen = 0;
  let genTimes = [];

  function updateGenTimer() {
    const gen = detectGeneration();

    if (gen !== lastTrackedGen && gen > 0) {
      if (lastTrackedGen > 0) {
        genTimes.push({ gen: lastTrackedGen, duration: Date.now() - genStartTime });
      }
      genStartTime = Date.now();
      lastTrackedGen = gen;
    }

    // Timer tracking only (no UI — removed bottom bar)
  }

  // ── Global Parameters HUD ──

  let globalsEl = null;
  let globalsVisible = false;

  function buildGlobalsPanel() {
    if (globalsEl) return globalsEl;
    globalsEl = document.createElement('div');
    globalsEl.className = 'tm-globals-panel';
    document.body.appendChild(globalsEl);
    return globalsEl;
  }

  const MAP_MILESTONES = {
    'Tharsis': ['Terraformer', 'Mayor', 'Gardener', 'Builder', 'Planner'],
    'Hellas':  ['Diversifier', 'Tactician', 'Polar Explorer', 'Energizer', 'Rim Settler'],
    'Elysium': ['Generalist', 'Specialist', 'Ecologist', 'Tycoon', 'Legend'],
  };

  function detectMap(game) {
    if (!game || !game.milestones) return '';
    const msNames = game.milestones.map(function(m) { return m.name; });
    for (const mapName in MAP_MILESTONES) {
      const expected = MAP_MILESTONES[mapName];
      if (expected.some(function(n) { return msNames.indexOf(n) >= 0; })) return mapName;
    }
    return '';
  }

  function updateGlobals() {
    if (!globalsVisible || !enabled) {
      if (globalsEl) globalsEl.style.display = 'none';
      return;
    }

    const panel = buildGlobalsPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game) {
      panel.style.display = 'none';
      return;
    }

    const g = pv.game;
    const gen = g.generation || detectGeneration();
    const temp = g.temperature != null ? g.temperature : '?';
    const oxy = g.oxygenLevel != null ? g.oxygenLevel : '?';
    const oceans = g.oceans != null ? g.oceans : '?';
    const venus = g.venusScaleLevel != null ? g.venusScaleLevel : null;

    // Calculate remaining raises
    const tempLeft = typeof temp === 'number' ? Math.max(0, (8 - temp) / 2) : '?';
    const oxyLeft = typeof oxy === 'number' ? Math.max(0, 14 - oxy) : '?';
    const oceansLeft = typeof oceans === 'number' ? Math.max(0, 9 - oceans) : '?';
    const venusLeft = venus != null ? Math.max(0, (30 - venus) / 2) : null;

    // Estimate gens remaining based on global progress
    let totalRaises = 0;
    let totalTarget = 0;
    if (typeof temp === 'number') { totalRaises += (temp + 30) / 2; totalTarget += 19; }
    if (typeof oxy === 'number') { totalRaises += oxy; totalTarget += 14; }
    if (typeof oceans === 'number') { totalRaises += oceans; totalTarget += 9; }
    const progress = totalTarget > 0 ? Math.round((totalRaises / totalTarget) * 100) : 0;

    // Game end estimation
    const raisesLeft = (typeof tempLeft === 'number' ? tempLeft : 0)
      + (typeof oxyLeft === 'number' ? oxyLeft : 0)
      + (typeof oceansLeft === 'number' ? oceansLeft : 0);
    const estGensLeft = Math.max(1, Math.ceil(raisesLeft / 3));

    const mapName = detectMap(g);

    // Game phase detection
    let phase, phaseColor, phaseHint;
    if (gen <= 2) {
      phase = 'Ранняя'; phaseColor = '#2ecc71';
      phaseHint = 'Приоритет: продукция, теги, engine-building';
    } else if (progress < 40) {
      phase = 'Развитие'; phaseColor = '#3498db';
      phaseHint = 'Приоритет: баланс продукции и VP-карт';
    } else if (progress < 75) {
      phase = 'Середина'; phaseColor = '#f39c12';
      phaseHint = 'Приоритет: VP-карты, TR, милестоуны/награды';
    } else {
      phase = 'Финал'; phaseColor = '#e74c3c';
      phaseHint = 'Приоритет: VP, конвертация ресурсов, стандартные проекты';
    }

    let html = '<div class="tm-gl-title">Глобальные (Пок. ' + gen + (mapName ? ' | ' + mapName : '') + ')</div>';
    html += '<div class="tm-gl-phase" style="color:' + phaseColor + '" title="' + phaseHint + '">' + phase + ' — ' + phaseHint + '</div>';
    html += '<div class="tm-gl-endgame">';
    html += '<div class="tm-pool-bar" style="margin:4px 0"><div class="tm-pool-fill" style="width:' + progress + '%"></div></div>';
    html += '<div style="text-align:center;font-size:11px;opacity:0.8">' + progress + '% | ~' + estGensLeft + ' пок. до конца</div>';
    html += '</div>';

    // Temperature
    const tempBonus = (typeof temp === 'number' && temp === -24) ? ' 🌊' : '';
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">🌡</span>';
    html += '<span class="tm-gl-label">Темп</span>';
    html += '<span class="tm-gl-val">' + temp + '°C' + tempBonus + '</span>';
    html += '<span class="tm-gl-left">ост. ' + tempLeft + '</span>';
    html += '</div>';
    if (typeof temp === 'number' && temp === -24) {
      html += '<div style="font-size:10px;color:#3498db;padding:0 4px 2px 24px">+1°C → бесплатный океан!</div>';
    }

    // Oxygen
    const oxyBonus = (typeof oxy === 'number' && oxy === 8) ? ' 🌡' : '';
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">O₂</span>';
    html += '<span class="tm-gl-label">Кислород</span>';
    html += '<span class="tm-gl-val">' + oxy + '%' + oxyBonus + '</span>';
    html += '<span class="tm-gl-left">ост. ' + oxyLeft + '</span>';
    html += '</div>';
    if (typeof oxy === 'number' && oxy === 8) {
      html += '<div style="font-size:10px;color:#e67e22;padding:0 4px 2px 24px">+1% O₂ → бонусный +1°C!</div>';
    }

    // Oceans
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">🌊</span>';
    html += '<span class="tm-gl-label">Океаны</span>';
    html += '<span class="tm-gl-val">' + oceans + '/9</span>';
    html += '<span class="tm-gl-left">ост. ' + oceansLeft + '</span>';
    html += '</div>';

    // Venus (if in game)
    if (venus != null) {
      html += '<div class="tm-gl-row">';
      html += '<span class="tm-gl-icon">♀</span>';
      html += '<span class="tm-gl-label">Венера</span>';
      html += '<span class="tm-gl-val">' + venus + '%</span>';
      html += '<span class="tm-gl-left">ост. ' + venusLeft + '</span>';
      html += '</div>';
      // Venus bonus thresholds
      const vBonuses = [];
      if (venus < 8) vBonuses.push('8% → +1 TR всем');
      if (venus < 16) vBonuses.push('16% → +1 TR всем');
      if (vBonuses.length > 0) {
        html += '<div style="font-size:10px;color:#e91e63;padding:0 4px 2px 24px">' + vBonuses.join(' | ') + '</div>';
      }
    }

    // Overall progress bar
    html += '<div class="tm-gl-progress">';
    html += '<div class="tm-gl-progress-bar"><div class="tm-gl-progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<span class="tm-gl-progress-pct">' + progress + '%</span>';
    html += '</div>';

    // Estimated gens remaining
    if (gen > 1 && progress > 0 && progress < 100) {
      const raisesPerGen = totalRaises / (gen - 1);
      const raisesNeeded = totalTarget - totalRaises;
      const gensEst = raisesPerGen > 0 ? Math.ceil(raisesNeeded / raisesPerGen) : '?';
      html += '<div class="tm-gl-est">~' + gensEst + ' пок. до конца</div>';
    }

    // Terraforming priority advisor
    {
      const priorities = [];
      if (tempLeft > 0) priorities.push({ name: 'Температура', left: tempLeft, spCost: 14, trPer: 1, bonus: temp <= -24 ? ' (+океан!)' : '' });
      if (oxyLeft > 0) priorities.push({ name: 'Кислород', left: oxyLeft, spCost: 23, trPer: 1, bonus: '' });
      if (oceansLeft > 0) priorities.push({ name: 'Океан', left: oceansLeft, spCost: 18, trPer: 1, bonus: ' (+бонус тайла)' });
      if (venus != null && venusLeft > 0) priorities.push({ name: 'Венера', left: venusLeft, spCost: 15, trPer: 1, bonus: '' });

      if (priorities.length > 0) {
        priorities.sort(function(a, b) { return a.spCost - b.spCost; });
        const best = priorities[0];
        html += '<div class="tm-gl-section">Приоритет терраформинга</div>';
        html += '<div class="tm-gl-priority" style="color:#2ecc71;font-size:11px">';
        html += '★ ' + best.name + ' — ' + best.spCost + ' MC/TR' + best.bonus;
        html += '</div>';
        if (priorities.length > 1) {
          const rest = priorities.slice(1).map(function(p) { return p.name + ' ' + p.spCost; }).join(' · ');
          html += '<div style="font-size:10px;opacity:0.6">' + rest + '</div>';
        }
      }
    }

    // Standard project costs with current resources
    const p = pv.thisPlayer;
    if (p) {
      const steel = p.steel || 0;
      const ti = p.titanium || 0;
      const steelVal = p.steelValue || 2;
      const tiVal = p.titaniumValue || 3;
      const mc = p.megaCredits || 0;

      html += '<div class="tm-gl-section">Стандартные проекты</div>';
      const projects = [
        { name: 'Озеленение', cost: 23, usesSteel: true, value: 1 },
        { name: 'Город', cost: 25, usesSteel: true, value: 1.5 },
        { name: 'Океан', cost: 18, value: 1 },
        { name: 'Температура', cost: 14, value: 1 },
        { name: 'Электростанция', cost: 11, value: 0.6 },
      ];

      // Calculate effective costs and find best affordable project
      let bestIdx = -1;
      let bestRatio = 999;
      for (let i = 0; i < projects.length; i++) {
        const proj = projects[i];
        proj.effective = proj.cost;
        if (proj.usesSteel) proj.effective = Math.max(0, proj.cost - steel * steelVal);
        proj.canAfford = mc >= proj.effective;
        if (proj.canAfford) {
          const ratio = proj.effective / proj.value;
          if (ratio < bestRatio) { bestRatio = ratio; bestIdx = i; }
        }
      }

      for (let i = 0; i < projects.length; i++) {
        const proj = projects[i];
        const isBest = (i === bestIdx);
        html += '<div class="tm-gl-sp-row' + (proj.canAfford ? '' : ' tm-gl-sp-cant') + (isBest ? ' tm-gl-sp-best' : '') + '">';
        html += '<span class="tm-gl-sp-name">' + (isBest ? '★ ' : '') + proj.name + '</span>';
        html += '<span class="tm-gl-sp-cost">';
        if (proj.usesSteel && steel > 0) {
          html += proj.effective + ' MC';
          html += ' <span class="tm-gl-sp-savings">(-' + Math.min(steel * steelVal, proj.cost) + '⚒)</span>';
        } else {
          html += proj.cost + ' MC';
        }
        html += '</span>';
        html += '</div>';
      }
    }

    // Resource conversion reminders + countdown
    if (pv.thisPlayer) {
      const myPlants = pv.thisPlayer.plants || 0;
      const myHeat = pv.thisPlayer.heat || 0;
      const plantProd = pv.thisPlayer.plantProduction || 0;
      const heatProd = pv.thisPlayer.heatProduction || 0;
      const energyProd = pv.thisPlayer.energyProduction || 0;
      const plantsNeeded = pv.thisPlayer.plantsNeededForGreenery || 8;
      const showSection = myPlants >= plantsNeeded || myHeat >= 8 || (plantProd > 0 && myPlants < plantsNeeded) || (heatProd + energyProd > 0 && myHeat < 8);

      if (showSection) {
        html += '<div class="tm-gl-section">Конвертация</div>';
        if (myPlants >= plantsNeeded) {
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#4caf50;font-weight:bold">🌿 ' + myPlants + '/' + plantsNeeded + ' → озеленение ГОТОВО</span></div>';
        } else if (plantProd > 0) {
          const gensToGreen = Math.ceil((plantsNeeded - myPlants) / plantProd);
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#4caf50">🌿 ' + myPlants + '/' + plantsNeeded + ' → через ' + gensToGreen + ' пок.</span></div>';
        }
        if (myHeat >= 8) {
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#ff6b35;font-weight:bold">🔥 ' + myHeat + '/8 → +1°C ГОТОВО</span></div>';
        } else if (heatProd + energyProd > 0) {
          const totalHeatPerGen = heatProd + energyProd;
          const gensToHeat = Math.ceil((8 - myHeat) / totalHeatPerGen);
          html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name" style="color:#ff6b35">🔥 ' + myHeat + '/8 → через ' + gensToHeat + ' пок.</span></div>';
        }
        // Conversion priority hint
        if (myPlants >= plantsNeeded && myHeat >= 8) {
          const tempMaxed = typeof temp === 'number' && temp >= 8;
          const oxyMaxed = typeof oxy === 'number' && oxy >= 14;
          if (tempMaxed && !oxyMaxed) {
            html += '<div style="font-size:10px;color:#2ecc71;padding:1px 4px">→ Озеленение первым (тепло уже не даёт TR)</div>';
          } else if (oxyMaxed && !tempMaxed) {
            html += '<div style="font-size:10px;color:#ff6b35;padding:1px 4px">→ Тепло первым (кислород уже макс)</div>';
          } else if (!tempMaxed && !oxyMaxed) {
            html += '<div style="font-size:10px;color:#3498db;padding:1px 4px">→ Озеленение первым (VP + TR vs только TR)</div>';
          }
        }
      }
    }

    // Turn order
    if (pv.game && pv.game.players && pv.thisPlayer) {
      const players = pv.game.players;
      const firstIdx = players.findIndex(function(pl) { return pl.isActive; });
      const myIdx = players.findIndex(function(pl) { return pl.color === pv.thisPlayer.color; });
      if (firstIdx >= 0 && myIdx >= 0 && players.length > 1) {
        const order = [];
        for (let i = 0; i < players.length; i++) {
          const idx = (firstIdx + i) % players.length;
          const pl = players[idx];
          const isMe = pl.color === pv.thisPlayer.color;
          order.push((isMe ? '▶ ' : '') + (pl.name || pl.color));
        }
        const myTurn = (myIdx - firstIdx + players.length) % players.length + 1;
        html += '<div class="tm-gl-section">Порядок хода</div>';
        html += '<div style="font-size:11px;color:#aaa;padding:1px 4px">' + order.join(' → ') + '</div>';
        if (myTurn > 1) {
          html += '<div style="font-size:10px;color:#f39c12;padding:1px 4px">Ты ходишь ' + myTurn + '-м</div>';
        } else {
          html += '<div style="font-size:10px;color:#2ecc71;padding:1px 4px">Ты ходишь первым!</div>';
        }
      }
    }

    // Board summary — cities, greeneries, oceans placed
    if (pv.game && pv.game.spaces) {
      let myCities = 0, myGreeneries = 0, totalCities = 0, totalGreeneries = 0;
      const myColor = pv.thisPlayer ? pv.thisPlayer.color : null;
      for (const sp of pv.game.spaces) {
        if (sp.tileType === 'city' || sp.tileType === 0 || sp.tileType === 'capital' || sp.tileType === 5) {
          totalCities++;
          if (sp.color === myColor) myCities++;
        }
        if (sp.tileType === 'greenery' || sp.tileType === 1) {
          totalGreeneries++;
          if (sp.color === myColor) myGreeneries++;
        }
      }
      if (totalCities > 0 || totalGreeneries > 0) {
        html += '<div class="tm-gl-section">Карта</div>';
        html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name">🏙 Города: ' + myCities + ' мои / ' + totalCities + ' всего</span></div>';
        html += '<div class="tm-gl-sp-row"><span class="tm-gl-sp-name">🌿 Озеленения: ' + myGreeneries + ' мои / ' + totalGreeneries + ' всего</span></div>';
        // VP from greeneries adjacent to my cities
        if (myCities > 0 && totalGreeneries > 0) {
          html += '<div style="font-size:10px;color:#888;padding:1px 4px">VP город = кол-во смежных озеленений</div>';
        }
      }
    }

    // Resource waste detection
    if (pv.thisPlayer) {
      const wastes = [];
      const myP = pv.thisPlayer;
      const tempMaxed = typeof temp === 'number' && temp >= 8;
      const oxyMaxed = typeof oxy === 'number' && oxy >= 14;
      const oceansMaxed = typeof oceans === 'number' && oceans >= 9;
      if (tempMaxed && (myP.heatProduction || 0) > 0) {
        wastes.push('🔥 Тепло-продукция (' + myP.heatProduction + ') без пользы (темп макс)');
      }
      if (oxyMaxed && (myP.plantProduction || 0) > 0 && !tempMaxed) {
        // Plants still give greenery VP even if O2 maxed, but no TR
        wastes.push('🌿 Озеленения не дают TR (O₂ макс), но всё ещё +1 VP');
      }
      if (tempMaxed && oxyMaxed && oceansMaxed) {
        // All params maxed — game ends this round
        wastes.push('⚠ Все параметры на максимуме — последнее поколение!');
      }
      if ((myP.energyProduction || 0) > 0 && (myP.energy || 0) > 10 && !myP.tableau.some(function(c) { const n = (c.name || c).toLowerCase(); return n.includes('power') || n.includes('energy'); })) {
        wastes.push('⚡ Энергия копится (' + myP.energy + ') — нет потребителей');
      }
      if (wastes.length > 0) {
        html += '<div class="tm-gl-section" style="color:#e74c3c">Предупреждения</div>';
        for (const w of wastes) {
          html += '<div style="font-size:10px;color:#e74c3c;padding:1px 4px">' + w + '</div>';
        }
      }
    }

    // My tag summary
    if (pv.thisPlayer && pv.thisPlayer.tags) {
      const tagLabels = {
        building: 'Стр', space: 'Косм', science: 'Нау', earth: 'Зем', jovian: 'Юпи',
        venus: 'Вен', plant: 'Раст', microbe: 'Мик', animal: 'Жив', event: 'Соб',
        power: 'Энер', city: 'Гор', mars: 'Марс', wild: 'Дик'
      };
      const tagColors = {
        building: '#8b7355', space: '#444', science: '#ecf0f1', earth: '#3498db', jovian: '#e67e22',
        venus: '#e91e63', plant: '#4caf50', microbe: '#27ae60', animal: '#8e44ad', event: '#e74c3c',
        power: '#9b59b6', city: '#888', mars: '#c0392b'
      };
      const myTags = [];
      for (const t of pv.thisPlayer.tags) {
        const tName = (t.tag || '').toLowerCase();
        if (t.count > 0 && tagLabels[tName]) {
          myTags.push({ name: tName, count: t.count, label: tagLabels[tName], color: tagColors[tName] || '#888' });
        }
      }
      if (myTags.length > 0) {
        myTags.sort(function(a, b) { return b.count - a.count; });
        html += '<div class="tm-gl-section">Мои теги</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:3px;padding:1px 4px">';
        for (const tag of myTags) {
          html += '<span class="tm-tag-pill" style="border-color:' + tag.color + '">' + tag.label + ':' + tag.count + '</span>';
        }
        html += '</div>';
      }
    }

    html += '<div class="tm-adv-hint">W — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── VP Tracker ──

  let vpEl = null;
  let vpVisible = false;

  function buildVPPanel() {
    if (vpEl) return vpEl;
    vpEl = document.createElement('div');
    vpEl.className = 'tm-vp-panel';
    document.body.appendChild(vpEl);
    return vpEl;
  }

  function updateVPTracker() {
    if (!vpVisible || !enabled) {
      if (vpEl) vpEl.style.display = 'none';
      return;
    }

    const panel = buildVPPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      panel.innerHTML = '<div class="tm-vp-title">Оценка VP</div><div class="tm-pool-more">Данные недоступны</div>';
      panel.style.display = 'block';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();

    // 1. TR
    const tr = p.terraformRating || 0;

    // 2. Greeneries — each is 1 VP (from tiles on map)
    // Count from Vue: p.tableau cards that placed greeneries, or from map tiles
    // Best approximation: check player's tile data if available
    let greeneries = 0;
    let cities = 0;

    // Try to read from player's played tiles
    if (pv.game && pv.game.spaces) {
      const myColor = pv.thisPlayer.color;
      for (const space of pv.game.spaces) {
        if (space.color === myColor) {
          if (space.tileType === 'greenery' || space.tileType === 1) greeneries++;
          if (space.tileType === 'city' || space.tileType === 0 ||
              space.tileType === 'capital' || space.tileType === 5) cities++;
        }
      }
    }

    // 3. Card VPs from tableau
    let cardVP = 0;
    let cardVPDetails = [];
    if (p.tableau) {
      for (const card of p.tableau) {
        const cardName = card.name || card;
        const data = TM_RATINGS[cardName];
        // Check for victoryPoints in Vue data
        if (card.victoryPoints !== undefined && card.victoryPoints !== 0) {
          let vp = 0;
          if (typeof card.victoryPoints === 'number') {
            vp = card.victoryPoints;
          } else if (card.victoryPoints && typeof card.victoryPoints.points === 'number') {
            vp = card.victoryPoints.points;
          }
          if (vp !== 0) {
            cardVP += vp;
            cardVPDetails.push({ name: cardName, vp: vp });
          }
        }
      }
    }

    // 4. VP from resources on cards (animals, microbes for Ants, etc.)
    // This comes from card.resources in Vue
    let resourceVP = 0;
    let resourceVPDetails = [];
    if (p.tableau) {
      for (const card of p.tableau) {
        const cardName = card.name || card;
        // Cards with "1 VP per resource" or similar
        if (card.resources && card.resources > 0) {
          // Check if this card gives VP per resource
          const data = TM_RATINGS[cardName];
          if (data) {
            const econ = (data.e || '').toLowerCase();
            // Common patterns: "1 vp per animal", "1 vp per microbe", "1/2 vp per"
            if (econ.includes('vp per') || econ.includes('vp/')) {
              let vpPer = 1;
              if (econ.includes('1/2 vp') || econ.includes('0.5 vp')) vpPer = 0.5;
              if (econ.includes('1/3 vp')) vpPer = 1/3;
              const vp = Math.floor(card.resources * vpPer);
              if (vp > 0) {
                resourceVP += vp;
                resourceVPDetails.push({ name: cardName, vp: vp, res: card.resources });
              }
            }
          }
        }
      }
    }

    // 5. Milestones — 5 VP each (check if we funded any)
    let milestoneVP = 0;
    if (pv.game && pv.game.milestones) {
      for (const ms of pv.game.milestones) {
        if (ms.playerColor === pv.thisPlayer.color || ms.player === pv.thisPlayer.color) {
          milestoneVP += 5;
        }
      }
    }

    // 6. Awards — use real scores from game
    let awardVP = 0;
    const awardDetails = [];
    if (pv.game && pv.game.awards) {
      const myColor = pv.thisPlayer.color;
      for (const aw of pv.game.awards) {
        if (!(aw.playerName || aw.color)) continue; // not funded
        if (!aw.scores || aw.scores.length === 0) continue;
        const sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        const myEntry = sorted.find(function(s) { return s.color === myColor; });
        if (!myEntry) continue;
        const myRank = sorted.findIndex(function(s) { return s.color === myColor; });
        let vpGain = 0;
        if (myRank === 0) vpGain = 5;
        else if (myRank === 1) vpGain = 2;
        // Tie with 1st
        if (myRank > 0 && sorted[0].score === myEntry.score) vpGain = 5;
        // Tie with 2nd (if not 1st)
        if (myRank > 1 && sorted[1] && sorted[1].score === myEntry.score) vpGain = 2;
        awardVP += vpGain;
        awardDetails.push({ name: aw.name, vp: vpGain, leader: sorted[0].color, leaderScore: sorted[0].score, myScore: myEntry.score });
      }
    }

    // 7. City adjacency bonus — use real breakdown if available
    const vb = p.victoryPointsBreakdown;
    const hasRealVP = vb && vb.total > 0;
    const cityAdj = hasRealVP ? (vb.city || 0) : cities * 1;

    // Use real VP data if available, else estimate
    let total;
    let rows;
    if (hasRealVP) {
      total = vb.total;
      const realCardVP = (vb.victoryPoints || 0);
      rows = [
        { label: 'Terraform Rating', val: vb.terraformRating || tr, cls: '' },
        { label: 'Озеленение', val: vb.greenery || greeneries, cls: '' },
        { label: 'Города', val: vb.city || 0, cls: '' },
        { label: 'VP с карт', val: realCardVP, cls: '' },
        { label: 'Вехи', val: vb.milestones || 0, cls: '' },
        { label: 'Награды', val: vb.awards || 0, cls: '' },
      ];
    } else {
      total = tr + greeneries + cardVP + resourceVP + milestoneVP + awardVP + cityAdj;
      rows = [
        { label: 'Terraform Rating', val: tr, cls: '' },
        { label: 'Озеленение', val: greeneries, cls: greeneries > 0 ? '' : 'tm-vp-zero' },
        { label: 'Города (оценка)', val: cityAdj, cls: cityAdj > 0 ? '' : 'tm-vp-zero' },
        { label: 'VP с карт', val: cardVP, cls: cardVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'VP с ресурсов', val: resourceVP, cls: resourceVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'Вехи', val: milestoneVP, cls: milestoneVP > 0 ? '' : 'tm-vp-zero' },
        { label: 'Награды', val: awardVP, cls: awardVP > 0 ? '' : 'tm-vp-zero' },
      ];
    }

    let html = '<div class="tm-vp-title">' + (hasRealVP ? 'VP' : 'Оценка VP') + ' (Пок. ' + gen + ')</div>';

    for (const r of rows) {
      if (r.val === 0 && r.cls === 'tm-vp-zero') continue; // skip zero rows
      html += '<div class="tm-vp-row' + (r.cls ? ' ' + r.cls : '') + '">';
      html += '<span class="tm-vp-label">' + r.label + '</span>';
      html += '<span class="tm-vp-val">' + r.val + '</span>';
      html += '</div>';
    }

    html += '<div class="tm-vp-total">';
    html += '<span>Итого' + (hasRealVP ? '' : ' (оценка)') + '</span>';
    html += '<span class="tm-vp-total-val">' + total + '</span>';
    html += '</div>';

    // VP distribution chart
    if (total > 0) {
      const segments = [];
      for (const r of rows) {
        if (r.val > 0) {
          const pctR = Math.round(r.val / total * 100);
          segments.push({ label: r.label, pct: pctR, val: r.val });
        }
      }
      if (segments.length > 0) {
        const barColors = ['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c'];
        html += '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin:4px 0">';
        for (let i = 0; i < segments.length; i++) {
          html += '<div style="width:' + segments[i].pct + '%;background:' + barColors[i % barColors.length] + '" title="' + segments[i].label + ': ' + segments[i].val + ' (' + segments[i].pct + '%)"></div>';
        }
        html += '</div>';
        html += '<div style="font-size:10px;color:#888;display:flex;flex-wrap:wrap;gap:4px">';
        for (let i = 0; i < segments.length; i++) {
          html += '<span><span style="color:' + barColors[i % barColors.length] + '">●</span> ' + segments[i].pct + '%</span>';
        }
        html += '</div>';
      }
    }

    // Card VP details — use real breakdown if available
    if (hasRealVP && vb.detailsCards && vb.detailsCards.length > 0) {
      const sorted = vb.detailsCards.slice().sort(function(a, b) { return b.victoryPoint - a.victoryPoint; });
      html += '<div class="tm-vp-section">VP по картам</div>';
      for (const c of sorted.slice(0, 8)) {
        html += '<div class="tm-vp-card-row">';
        html += '<span class="tm-vp-card-name">' + escHtml(ruName(c.cardName)) + '</span>';
        html += '<span class="tm-vp-card-val">' + (c.victoryPoint > 0 ? '+' : '') + c.victoryPoint + '</span>';
        html += '</div>';
      }
      if (sorted.length > 8) {
        html += '<div class="tm-pool-more">+' + (sorted.length - 8) + ' ещё</div>';
      }
    } else {
      const allVPCards = [...cardVPDetails, ...resourceVPDetails].sort((a, b) => b.vp - a.vp);
      if (allVPCards.length > 0) {
        html += '<div class="tm-vp-section">VP по картам</div>';
        for (const c of allVPCards.slice(0, 8)) {
          html += '<div class="tm-vp-card-row">';
          html += '<span class="tm-vp-card-name">' + escHtml(ruName(c.name)) + '</span>';
          html += '<span class="tm-vp-card-val">+' + c.vp + (c.res ? ' (' + c.res + ' рес.)' : '') + '</span>';
          html += '</div>';
        }
        if (allVPCards.length > 8) {
          html += '<div class="tm-pool-more">+' + (allVPCards.length - 8) + ' ещё</div>';
        }
      }
    }

    // Award VP details
    if (awardDetails.length > 0) {
      html += '<div class="tm-vp-section">Награды</div>';
      for (const ad of awardDetails) {
        const color = ad.vp >= 5 ? '#4caf50' : ad.vp > 0 ? '#f1c40f' : '#666';
        html += '<div class="tm-vp-row">';
        html += '<span class="tm-vp-label">' + escHtml(ad.name) + ' <span style="color:' + ad.leader + '">(' + ad.leaderScore + ')</span> мой:' + ad.myScore + '</span>';
        html += '<span class="tm-vp-val" style="color:' + color + '">' + (ad.vp > 0 ? '+' + ad.vp : '0') + '</span>';
        html += '</div>';
      }
    }

    // VP delta vs opponents
    if (pv.game && pv.game.players) {
      const myColor = pv.thisPlayer.color;
      const opponents = pv.game.players.filter(function(pl) { return pl.color !== myColor; });
      if (opponents.length > 0) {
        html += '<div class="tm-vp-section">Дельта VP</div>';
        for (const opp of opponents) {
          const oppTR = opp.terraformRating || 0;
          let oppGreen = 0;
          if (pv.game.spaces) {
            for (const sp of pv.game.spaces) {
              if (sp.color === opp.color && (sp.tileType === 'greenery' || sp.tileType === 1)) oppGreen++;
            }
          }
          const oppEst = oppTR + oppGreen;
          const delta = total - oppEst;
          const sign = delta > 0 ? '+' : '';
          const color = delta > 0 ? '#4caf50' : delta < 0 ? '#f44336' : '#aaa';
          html += '<div class="tm-vp-row">';
          html += '<span class="tm-vp-label" style="color:' + opp.color + '">' + (opp.name || opp.color) + ' (~' + oppEst + ')</span>';
          html += '<span class="tm-vp-val" style="color:' + color + ';font-weight:bold">' + sign + delta + '</span>';
          html += '</div>';
        }
      }
    }

    // Score projection — estimate final VP
    {
      const gen = detectGeneration();
      if (gen >= 3 && pv.game) {
        let gTemp = pv.game.temperature; let gOxy = pv.game.oxygenLevel; let gOce = pv.game.oceans;
        let raises = 0, target = 0;
        if (typeof gTemp === 'number') { raises += (gTemp + 30) / 2; target += 19; }
        if (typeof gOxy === 'number') { raises += gOxy; target += 14; }
        if (typeof gOce === 'number') { raises += gOce; target += 9; }
        const prog = target > 0 ? raises / target : 0;
        const estGensLeft = prog > 0 ? Math.max(1, Math.ceil((1 - prog) * gen / prog)) : 3;
        const myP = pv.thisPlayer;
        if (myP) {
          // Future TR growth (assume ~1-2 TR/gen from cards)
          const futureTR = Math.round(estGensLeft * 1.5);
          // Future greeneries from plants
          const plantsPerGen = myP.plantProduction || 0;
          const futureGreeneries = Math.floor((myP.plants || 0 + plantsPerGen * estGensLeft) / (myP.plantsNeededForGreenery || 8));
          // Projected total
          const projectedTotal = total + futureTR + futureGreeneries;
          // MC per VP efficiency
          if (myP.tableau && total > 20) {
            let estMCSpent = 0;
            for (const card of myP.tableau) {
              const cn = card.name || card;
              const d = TM_RATINGS[cn];
              if (d && typeof d.s === 'number') {
                // Estimate card cost from DOM or ratings — rough: cards average ~15 MC + 3 draft
                const costEl = document.querySelector('.card-container[data-tm-card="' + cn + '"] .card-number');
                const cardCost = costEl ? parseInt(costEl.textContent) : 15;
                estMCSpent += (isNaN(cardCost) ? 15 : cardCost) + 3;
              }
            }
            const vpGained = total - 20; // VP above starting TR
            if (vpGained > 0 && estMCSpent > 0) {
              const mcPerVP = (estMCSpent / vpGained).toFixed(1);
              const effColor = mcPerVP <= 7 ? '#2ecc71' : mcPerVP <= 10 ? '#f1c40f' : '#e74c3c';
              html += '<div class="tm-vp-section">Эффективность</div>';
              html += '<div style="font-size:11px;padding:2px 4px">';
              html += 'Потрачено ~' + estMCSpent + ' MC → +' + vpGained + ' VP = ';
              html += '<span style="color:' + effColor + ';font-weight:bold">' + mcPerVP + ' MC/VP</span>';
              html += '</div>';
            }
          }
          html += '<div class="tm-vp-section">Прогноз финала</div>';
          html += '<div style="font-size:12px;padding:2px 4px">';
          html += 'Текущие: <b>' + total + ' VP</b> | ';
          html += 'Прогноз: <b style="color:#2ecc71">~' + projectedTotal + ' VP</b>';
          html += '</div>';
          html += '<div style="font-size:10px;color:#888;padding:1px 4px">';
          html += '+' + futureTR + ' TR (рост) +' + futureGreeneries + ' озел. (~' + estGensLeft + ' пок.)';
          html += '</div>';

          // Winning condition — what you need to win
          if (pv.players) {
            let maxOppEst = 0;
            for (const opp of pv.players) {
              if (opp.color === pv.thisPlayer.color) continue;
              const oppTR = opp.terraformRating || 0;
              let oppGreen = 0;
              if (pv.game.spaces) {
                for (const sp of pv.game.spaces) {
                  if (sp.color === opp.color && (sp.tileType === 'greenery' || sp.tileType === 1)) oppGreen++;
                }
              }
              const oppEst = oppTR + oppGreen + Math.round(estGensLeft * 1.5);
              if (oppEst > maxOppEst) maxOppEst = oppEst;
            }
            const vpNeeded = Math.max(0, maxOppEst - projectedTotal + 1);
            if (vpNeeded > 0) {
              const vpPerGen = estGensLeft > 0 ? (vpNeeded / estGensLeft).toFixed(1) : vpNeeded;
              html += '<div style="font-size:11px;color:#e74c3c;padding:2px 4px;margin-top:2px;border:1px solid rgba(231,76,60,0.3);border-radius:4px">';
              html += '🎯 Для победы: +' + vpNeeded + ' VP (' + vpPerGen + '/пок.)';
              html += '</div>';
            } else {
              html += '<div style="font-size:11px;color:#2ecc71;padding:2px 4px;margin-top:2px">✓ На пути к победе!</div>';
            }
          }
        }
      }
    }

    // End-game VP optimization tips
    {
      const gen = detectGeneration();
      // Calculate progress from Vue game data
      let vpProgress = 0;
      if (pv.game) {
        let raises = 0, target = 0;
        const gTemp = pv.game.temperature; const gOxy = pv.game.oxygenLevel; const gOce = pv.game.oceans;
        if (typeof gTemp === 'number') { raises += (gTemp + 30) / 2; target += 19; }
        if (typeof gOxy === 'number') { raises += gOxy; target += 14; }
        if (typeof gOce === 'number') { raises += gOce; target += 9; }
        if (target > 0) vpProgress = Math.round(raises / target * 100);
      }
      if (gen >= 6 || vpProgress >= 60) {
        const tips = [];
        const myP = pv.thisPlayer;
        if (myP) {
          const myPlants = myP.plants || 0;
          const plantsNeeded = myP.plantsNeededForGreenery || 8;
          if (myPlants >= plantsNeeded) {
            tips.push('🌿 Конвертируй ' + plantsNeeded + ' растений → озеленение (+1 VP)');
          } else if (myPlants >= plantsNeeded - 3 && myP.plantProduction >= 2) {
            tips.push('🌿 Через 1 пок. хватит на озеленение (' + myPlants + '/' + plantsNeeded + ')');
          }
          const myHeat = myP.heat || 0;
          if (myHeat >= 8) {
            tips.push('🔥 Конвертируй тепло → +1°C (+1 TR)');
          }
          // Check available standard projects for VP
          const myMC = myP.megaCredits || 0;
          const mySt = myP.steel || 0;
          const stVal = myP.steelValue || 2;
          if (myMC + mySt * stVal >= 23) tips.push('💰 Хватает на озеленение (23 MC)');
          if (myMC >= 18 && pv.game) {
            const oce = pv.game.oceans != null ? pv.game.oceans : 0;
            if (oce < 9) tips.push('🌊 Можно купить океан (18 MC → +1 TR)');
          }
          // Unused blue card actions
          let unusedActions = 0;
          if (myP.tableau) {
            for (const card of myP.tableau) {
              if (card.isDisabled === false && (card.action || card.actions)) unusedActions++;
            }
          }
          if (unusedActions > 0) tips.push('🎯 ' + unusedActions + ' неиспользованных action-карт');
        }
        if (tips.length > 0) {
          html += '<div class="tm-vp-section">Советы VP</div>';
          for (const tip of tips) {
            html += '<div class="tm-vp-tip">' + tip + '</div>';
          }
        }
      }
    }

    // TR history
    html += getTRHistoryHTML();

    html += '<div class="tm-adv-hint">V — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Best Card in Hand ──

  function updateBestHandCard() {
    document.querySelectorAll('.tm-best-hand').forEach(function(el) { el.classList.remove('tm-best-hand'); });
    if (!enabled) return;

    const handCards = document.querySelectorAll('.player_home_block--hand .card-container[data-tm-card]');
    let best = null;
    let bestScore = -1;

    for (const el of handCards) {
      const name = el.getAttribute('data-tm-card');
      const data = name ? TM_RATINGS[name] : null;
      if (data && data.s > bestScore) {
        bestScore = data.s;
        best = el;
      }
    }

    if (best && bestScore >= 60) {
      best.classList.add('tm-best-hand');
    }
  }

  // ── TR History Tracker ──

  const trHistory = []; // [{gen, tr}]
  let lastTRHistoryGen = 0;

  function trackTRHistory() {
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    const gen = detectGeneration();
    if (gen <= 0) return;
    const tr = pv.thisPlayer.terraformRating || 20;
    if (gen !== lastTRHistoryGen) {
      // New generation — record TR at start
      const existing = trHistory.find(function(h) { return h.gen === gen; });
      if (!existing) {
        trHistory.push({ gen: gen, tr: tr });
        if (trHistory.length > 20) trHistory.shift();
      }
      lastTRHistoryGen = gen;
    } else if (trHistory.length > 0) {
      // Same gen — update current entry to latest TR
      trHistory[trHistory.length - 1].tr = tr;
    }
  }

  function getTRHistoryHTML() {
    if (trHistory.length < 2) return '';
    let html = '<div class="tm-vp-section">TR по поколениям</div>';
    html += '<div class="tm-tr-history">';
    for (let i = 0; i < trHistory.length; i++) {
      const h = trHistory[i];
      const delta = i > 0 ? h.tr - trHistory[i - 1].tr : 0;
      const deltaStr = i > 0 ? (delta >= 0 ? '+' + delta : '' + delta) : '—';
      const deltaColor = delta > 0 ? '#2ecc71' : delta < 0 ? '#e74c3c' : '#888';
      html += '<span class="tm-tr-h-item">';
      html += '<span style="color:#888">П' + h.gen + ':</span> ';
      html += '<span style="color:#f1c40f">' + h.tr + '</span>';
      if (i > 0) html += ' <span style="color:' + deltaColor + ';font-size:10px">(' + deltaStr + ')</span>';
      html += '</span>';
    }
    // Average TR gain
    if (trHistory.length >= 2) {
      const totalGain = trHistory[trHistory.length - 1].tr - trHistory[0].tr;
      const gens = trHistory.length - 1;
      const avg = (totalGain / gens).toFixed(1);
      html += '<div style="margin-top:3px;font-size:10px;color:#aaa">Средний рост: +' + avg + ' TR/пок.</div>';
    }
    html += '</div>';
    return html;
  }

  // ── Playable Card Highlight ──

  let playableVisible = false;

  function getCardTags(cardEl) {
    const tags = new Set();
    cardEl.querySelectorAll('[class*="tag-"]').forEach((el) => {
      for (const cls of el.classList) {
        if (cls.startsWith('tag-') && cls !== 'tag-count') {
          tags.add(cls.replace('tag-', ''));
        }
      }
    });
    return tags;
  }

  function getCardCost(cardEl) {
    const costEl = cardEl.querySelector('.card-number');
    if (costEl) {
      const num = parseInt(costEl.textContent);
      if (!isNaN(num)) return num;
    }
    return null;
  }

  function detectHelion(pv) {
    if (pv.thisPlayer.tableau) {
      for (const card of pv.thisPlayer.tableau) {
        if ((card.name || '').toLowerCase() === 'helion') return true;
      }
    }
    return false;
  }

  let playableCountEl = null;

  function updatePlayableHighlight() {
    // Remove old classes
    document.querySelectorAll('.tm-playable, .tm-unplayable').forEach((el) => {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });

    // Remove counter if hidden
    if (!playableVisible || !enabled) {
      if (playableCountEl) { playableCountEl.style.display = 'none'; }
      return;
    }

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    const p = pv.thisPlayer;
    const mc = p.megaCredits || 0;
    const steel = p.steel || 0;
    const steelVal = p.steelValue || 2;
    const ti = p.titanium || 0;
    const tiVal = p.titaniumValue || 3;
    const heat = p.heat || 0;

    // Detect Helion
    const isHelion = detectHelion(pv);
    const heatMC = isHelion ? heat : 0;

    const handCards = document.querySelectorAll('.player_home_block--hand .card-container');
    let playable = 0;
    let total = 0;
    let typeGreen = 0, typeBlue = 0, typeRed = 0;

    for (const cardEl of handCards) {
      const cost = getCardCost(cardEl);
      if (cost === null) continue;
      total++;

      // Detect card type from CSS class
      if (cardEl.querySelector('.card-content-wrapper--automated, .project-card--automated') || cardEl.classList.contains('card--automated')) typeGreen++;
      else if (cardEl.querySelector('.card-content-wrapper--active, .project-card--active') || cardEl.classList.contains('card--active')) typeBlue++;
      else if (cardEl.querySelector('.card-content-wrapper--event, .project-card--event') || cardEl.classList.contains('card--event')) typeRed++;

      const tags = getCardTags(cardEl);
      const hasBuilding = tags.has('building');
      const hasSpace = tags.has('space');

      let buyingPower = mc + heatMC;
      if (hasBuilding) buyingPower += steel * steelVal;
      if (hasSpace) buyingPower += ti * tiVal;

      if (buyingPower >= cost) {
        cardEl.classList.add('tm-playable');
        playable++;
      } else {
        cardEl.classList.add('tm-unplayable');
      }
    }

    // Show playable count badge
    if (!playableCountEl) {
      playableCountEl = document.createElement('div');
      playableCountEl.className = 'tm-playable-count';
      document.body.appendChild(playableCountEl);
    }
    const pct = total > 0 ? Math.round(playable / total * 100) : 0;
    const color = playable === 0 ? '#e74c3c' : playable <= 2 ? '#f39c12' : '#2ecc71';
    playableCountEl.style.display = 'block';
    playableCountEl.style.borderColor = color;
    let badgeHTML = '<span style="color:' + color + ';font-weight:bold">' + playable + '</span>/' + total + ' играбельных <span style="opacity:0.6">(' + pct + '%)</span>';
    if (total > 0) {
      badgeHTML += '<div style="font-size:10px;margin-top:1px;opacity:0.7">';
      if (typeGreen > 0) badgeHTML += '<span style="color:#4caf50">' + typeGreen + '⚙</span> ';
      if (typeBlue > 0) badgeHTML += '<span style="color:#2196f3">' + typeBlue + '↻</span> ';
      if (typeRed > 0) badgeHTML += '<span style="color:#f44336">' + typeRed + '⚡</span>';
      badgeHTML += '</div>';
    }
    // Hand value score
    const handNames = getMyHandNames();
    if (handNames.length > 0) {
      let totalScore = 0;
      let rated = 0;
      for (const hn of handNames) {
        const d = TM_RATINGS[hn];
        if (d) { totalScore += d.s; rated++; }
      }
      if (rated > 0) {
        const avg = (totalScore / rated).toFixed(0);
        const avgColor = avg >= 75 ? '#2ecc71' : avg >= 60 ? '#f1c40f' : '#e74c3c';
        badgeHTML += '<div style="font-size:10px;opacity:0.7">Рейтинг руки: <span style="color:' + avgColor + '">' + avg + '</span></div>';
      }
    }
    playableCountEl.innerHTML = badgeHTML;
  }

  // ── Turmoil Tracker ──

  let turmoilEl = null;
  let turmoilVisible = false;

  const PARTY_COLORS = {
    'mars first': '#c0392b',
    'scientists': '#ecf0f1',
    'unity': '#e91e63',
    'greens': '#27ae60',
    'reds': '#e74c3c',
    'kelvinists': '#8e44ad',
  };

  const PARTY_NAMES_RU = {
    'mars first': 'Марс прежде всего',
    'scientists': 'Учёные',
    'unity': 'Единство',
    'greens': 'Зелёные',
    'reds': 'Красные',
    'kelvinists': 'Кельвинисты',
  };

  function partyNameRu(name) {
    if (!name) return '?';
    return PARTY_NAMES_RU[name.toLowerCase()] || name;
  }

  function partyColor(name) {
    if (!name) return '#888';
    return PARTY_COLORS[name.toLowerCase()] || '#888';
  }

  function buildTurmoilPanel() {
    if (turmoilEl) return turmoilEl;
    turmoilEl = document.createElement('div');
    turmoilEl.className = 'tm-turmoil-panel';
    document.body.appendChild(turmoilEl);
    return turmoilEl;
  }

  // Global event impact data (name → description of effect for quick lookup)
  const GLOBAL_EVENT_EFFECTS = {
    // Positive events
    'Spin-Off Products': { desc: '+2 MC за Science тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'science')) * 2; } },
    'Diversity': { desc: '9+ тегов (с влиянием) → +10 MC', calc: function(p) { return uniqueTagCount(p) >= 9 ? 10 : 0; } },
    'Asteroid Mining': { desc: '+1 Ti за Jovian тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'jovian')) * 3; } },
    'Sponsored Projects': { desc: '+1 ресурс на карты с ресурсами. +1 карта за влияние', calc: function() { return 3.5; } },
    'Interplanetary Trade': { desc: '+2 MC за Space тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'space')) * 2; } },
    'Celebrity Leaders': { desc: '+2 MC за Event (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'event')) * 2; } },
    'Homeworld Support': { desc: '+2 MC за Earth тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'earth')) * 2; } },
    'Productivity': { desc: '+1 Steel за Steel-prod (макс 5) + влияние', calc: function(p) { return Math.min(5, (p.steelProduction || 0)) * 2; } },
    'Strong Society': { desc: '+2 MC за City тайл (макс 5) + влияние', calc: null },
    'Successful Organisms': { desc: '+1 Plant за Plant-prod (макс 5) + влияние', calc: function(p) { return Math.min(5, (p.plantProduction || 0)) * 2.5; } },
    'Venus Infrastructure': { desc: '+2 MC за Venus тег (макс 5) + влияние', calc: function(p) { return Math.min(5, countTag(p, 'venus')) * 2; } },
    'Scientific Community': { desc: '+1 MC за карту в руке (без лимита) + влияние', calc: null },
    'Generous Funding': { desc: '+2 MC за каждые 5 TR > 15 (макс 5) + влияние', calc: function(p) { return Math.min(5, Math.floor(((p.terraformRating || 0) - 15) / 5)) * 2; } },
    'Improved Energy Templates': { desc: '+1 Energy-prod за 2 Power тега + влияние', calc: function(p) { return Math.floor(countTag(p, 'power') / 2) * 7; } },
    'Jovian Tax Rights': { desc: '+1 MC-prod за колонию. +1 Ti за влияние', calc: function(p) { return (p.coloniesCount || 0) * 5; } },
    'Election': { desc: '1-й по очкам → +2 TR, 2-й → +1 TR', calc: null },
    // Negative events
    'Pandemic': { desc: '−3 MC за Building тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'building')) * 3; } },
    'Eco Sabotage': { desc: 'Потерять все растения кроме 3 + влияние', calc: function(p) { return -Math.max(0, (p.plants || 0) - 3) * 2.5; } },
    'Mud Slides': { desc: '−2 MC за City тайл (макс 5), −влияние', calc: null },
    'Snow Cover': { desc: '−2°C. +1 карта за влияние', calc: function() { return -7; } },
    'Solar Flare': { desc: '−3 MC за Space тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'space')) * 3; } },
    'War on Earth': { desc: '−4 TR. Влияние уменьшает потерю', calc: function() { return -28; } },
    'Revolution': { desc: '1-й по очкам → −2 TR, 2-й → −1 TR', calc: null },
    'Global Dust Storm': { desc: 'Потерять всё тепло. −2 MC за Building (макс 5), −влияние', calc: function(p) { return -(p.heat || 0) - Math.min(5, countTag(p, 'building')) * 2; } },
    'Red Influence': { desc: '−3 MC за 5 TR > 10 (макс 5). +1 MC-prod за влияние', calc: function(p) { return -Math.min(5, Math.floor(((p.terraformRating || 0) - 10) / 5)) * 3; } },
    'Miners On Strike': { desc: '−1 Ti за Jovian тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'jovian')) * 3; } },
    'Riots': { desc: '−4 MC за City тайл (макс 5), −влияние', calc: null },
    'Sabotage': { desc: '−1 Steel-prod, −1 Energy-prod. +1 Steel за влияние', calc: function() { return -10; } },
    'Solarnet Shutdown': { desc: '−3 MC за Blue карту (макс 5), −влияние', calc: null },
    'Microgravity Health Problems': { desc: '−1 MC за Space тег (макс 5), −влияние', calc: function(p) { return -Math.min(5, countTag(p, 'space')); } },
    'Corrosive Rain': { desc: '−2 Floater или −10 MC. +1 карта за влияние', calc: function() { return -6; } },
    'Volcanic Eruptions': { desc: '+1 Plant-prod за Plant тег', calc: function(p) { return countTag(p, 'plant') * 8; } },
    'Paradigm Breakdown': { desc: '−1 MC за Science тег, −влияние', calc: function(p) { return -countTag(p, 'science'); } },
  };

  function countTag(player, tag) {
    if (!player || !player.tags) return 0;
    const t = player.tags.find(function(x) { return (x.tag || '').toLowerCase() === tag; });
    return t ? (t.count || 0) : 0;
  }

  function uniqueTagCount(player) {
    if (!player || !player.tags) return 0;
    return player.tags.filter(function(t) { return t.count > 0; }).length;
  }

  const PARTY_POLICIES = {
    'Mars First':    { ru: 'Марс Первый', effect: 'Стал-карты −2 MC', bonus: '+1 MC за каждый тег Building' },
    'Scientists':    { ru: 'Учёные', effect: '−1 MC за тег Science при розыгрыше', bonus: '+1 MC за каждый тег Science' },
    'Unity':         { ru: 'Единство', effect: 'Титан-карты −2 MC', bonus: '+1 MC за каждый тег Venus/Earth/Jovian' },
    'Greens':        { ru: 'Зелёные', effect: '+4 MC за озеленение', bonus: '+1 MC за каждый тег Plant/Microbe/Animal' },
    'Reds':          { ru: 'Красные', effect: '+3 MC за шаг TR', bonus: '−1 TR если TR > ср.' },
    'Kelvinists':    { ru: 'Кельвинисты', effect: '6 MC = +1°C', bonus: '+1 MC за каждые 2 Heat-prod' },
  };

  function updateTurmoilTracker() {
    if (!turmoilVisible || !enabled) {
      if (turmoilEl) turmoilEl.style.display = 'none';
      return;
    }

    const panel = buildTurmoilPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.game.turmoil) {
      panel.innerHTML = '<div class="tm-turm-title">Турмоил</div>' +
        '<div class="tm-pool-more">Турмоил не включён</div>' +
        '<div class="tm-adv-hint">R — вкл/выкл</div>';
      panel.style.display = 'block';
      return;
    }

    const t = pv.game.turmoil;
    const myColor = pv.thisPlayer.color;

    let html = '<div class="tm-turm-title">Турмоил</div>';

    // Ruling party
    const ruling = t.ruling || t.rulingParty;
    if (ruling) {
      const rColor = partyColor(ruling);
      const isReds = ruling.toLowerCase() === 'reds';
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Правящая:</span>';
      html += '<span class="tm-turm-party" style="color:' + rColor + '">' + escHtml(partyNameRu(ruling)) + '</span>';
      html += '</div>';

      if (isReds) {
        html += '<div class="tm-turm-warn">+3 MC за каждый шаг TR</div>';
      }
      // Policy description
      const rPolicy = PARTY_POLICIES[ruling];
      if (rPolicy) {
        html += '<div style="font-size:11px;color:#888;padding:2px 0">' + rPolicy.effect + '</div>';
      }
    }

    // Dominant party
    const dominant = t.dominant || t.dominantParty;
    if (dominant) {
      const dColor = partyColor(dominant);
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Доминир.:</span>';
      html += '<span class="tm-turm-party" style="color:' + dColor + '">' + escHtml(partyNameRu(dominant)) + '</span>';
      html += '</div>';
    }

    // Chairman
    if (t.chairman) {
      html += '<div class="tm-turm-row">';
      html += '<span class="tm-turm-label">Председат.:</span>';
      html += '<span class="tm-turm-val">' + escHtml(t.chairman) + '</span>';
      html += '</div>';
    }

    // Global events
    const events = [];
    if (t.distant) events.push({ label: 'Далёкое', data: t.distant });
    if (t.coming) events.push({ label: 'Ближайшее', data: t.coming });
    if (t.current) events.push({ label: 'Текущее', data: t.current });

    if (events.length > 0) {
      html += '<div class="tm-turm-section">Глобальные события</div>';
      for (const ev of events) {
        const evName = typeof ev.data === 'string' ? ev.data : (ev.data.name || ev.data.id || '?');
        const evEffect = GLOBAL_EVENT_EFFECTS[evName];
        html += '<div class="tm-turm-event">';
        html += '<span class="tm-turm-ev-label">' + ev.label + ':</span> ';
        html += '<span class="tm-turm-ev-name">' + escHtml(evName) + '</span>';
        if (evEffect) {
          html += '<div style="font-size:10px;color:#aaa;padding-left:12px">' + evEffect.desc + '</div>';
          if (evEffect.calc && pv.thisPlayer) {
            const impact = evEffect.calc(pv.thisPlayer);
            const impColor = impact > 0 ? '#4caf50' : impact < 0 ? '#f44336' : '#888';
            html += '<div style="font-size:11px;padding-left:12px;color:' + impColor + ';font-weight:bold">Мне: ' + (impact > 0 ? '+' : '') + impact + ' MC</div>';
          }
        }
        html += '</div>';
      }
    }

    // Parties breakdown — delegates
    if (t.parties && t.parties.length > 0) {
      html += '<div class="tm-turm-section">Партии</div>';
      // Sort parties by delegate count desc
      const sortedParties = [...t.parties].sort((a, b) => {
        const aLen = (a.delegates || []).length;
        const bLen = (b.delegates || []).length;
        return bLen - aLen;
      });
      for (const party of sortedParties) {
        const pName = party.name || '?';
        const pColor = partyColor(pName);
        const dels = party.delegates || [];
        const total = dels.length;
        // Count my delegates
        let myDels = 0;
        for (const d of dels) {
          const dc = typeof d === 'string' ? d : (d.color || d);
          if (dc === myColor) myDels++;
        }
        const leader = party.partyLeader;
        const leaderText = leader ? (leader === myColor ? ' (лидер: я)' : '') : '';

        html += '<div class="tm-turm-party-row">';
        html += '<span class="tm-turm-party-dot" style="background:' + pColor + '"></span>';
        html += '<span class="tm-turm-party-name">' + escHtml(partyNameRu(pName)) + '</span>';
        html += '<span class="tm-turm-party-dels">' + total + ' дел.' +
          (myDels > 0 ? ' <b>(' + myDels + ' мои)</b>' : '') +
          leaderText + '</span>';
        html += '</div>';
      }
    }

    // Next gen prediction: dominant becomes ruling
    if (dominant && dominant !== ruling) {
      const nextPolicy = PARTY_POLICIES[dominant];
      if (nextPolicy) {
        html += '<div class="tm-turm-section">Прогноз сл. пок.</div>';
        html += '<div style="font-size:12px;color:#ccc;padding:2px 0">';
        html += '<span style="color:' + partyColor(dominant) + ';font-weight:bold">' + escHtml(partyNameRu(dominant)) + '</span> → правящая';
        html += '</div>';
        html += '<div style="font-size:11px;color:#f1c40f;padding:1px 0">' + nextPolicy.effect + '</div>';
        html += '<div style="font-size:11px;color:#888;padding:1px 0">' + nextPolicy.bonus + '</div>';
      }
    }

    // My delegates in lobby/reserve + influence
    {
      const lobbyDels = ((t.lobby || []).filter((d) => {
        const dc = typeof d === 'string' ? d : (d.color || d);
        return dc === myColor;
      })).length;
      const reserveDels = ((t.reserve || []).filter((d) => {
        const dc = typeof d === 'string' ? d : (d.color || d);
        return dc === myColor;
      })).length;

      // Count total my delegates across all parties
      let totalMyDels = lobbyDels + reserveDels;
      let isChairman = (t.chairman === myColor);
      let partiesWithMyDels = 0;
      if (t.parties) {
        for (const party of t.parties) {
          let myInParty = 0;
          for (const d of (party.delegates || [])) {
            const dc = typeof d === 'string' ? d : (d.color || d);
            if (dc === myColor) myInParty++;
          }
          totalMyDels += myInParty;
          if (myInParty > 0) partiesWithMyDels++;
        }
      }

      // Influence = chairman(1) + party leader(1) + 1 per 2 non-leader dels in ruling party
      let influence = isChairman ? 1 : 0;
      if (ruling && t.parties) {
        const rulingParty = t.parties.find((p) => p.name === ruling);
        if (rulingParty) {
          if (rulingParty.partyLeader === myColor) influence++;
          let myInRuling = 0;
          for (const d of (rulingParty.delegates || [])) {
            const dc = typeof d === 'string' ? d : (d.color || d);
            if (dc === myColor) myInRuling++;
          }
          // Non-leader delegates count
          const nonLeader = rulingParty.partyLeader === myColor ? myInRuling - 1 : myInRuling;
          influence += Math.floor(nonLeader / 2);
        }
      }

      html += '<div class="tm-turm-section">Мои делегаты</div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Лобби:</span><span class="tm-turm-val">' + lobbyDels + '</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Резерв:</span><span class="tm-turm-val">' + reserveDels + '</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Всего:</span><span class="tm-turm-val">' + totalMyDels + ' (в ' + partiesWithMyDels + ' партиях)</span></div>';
      html += '<div class="tm-turm-row"><span class="tm-turm-label">Влияние:</span><span class="tm-turm-val" style="color:#f1c40f;font-weight:bold">' + influence + '</span></div>';
      if (isChairman) {
        html += '<div style="font-size:11px;color:#f1c40f;padding:1px 0">Ты председатель (+1 влияние)</div>';
      }
    }

    html += '<div class="tm-adv-hint">R — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Colony Advisor ──

  // MC conversion rates per resource unit
  const RES_MC_VALUE = { MC: 1, Steel: 2, Titanium: 3, Plant: 2.5, Heat: 0.8, Card: 3.5, Microbe: 2, Animal: 5, Floater: 3 };

  const COLONY_DATA = {
    'Callisto':    { res: 'MC',       track: [0,2,3,5,7,10,13], bonus: '3 MC-prod' },
    'Ceres':       { res: 'Steel',    track: [1,2,3,4,5,6,7], bonus: '2 steel-prod' },
    'Enceladus':   { res: 'Microbe',  track: [0,1,1,2,2,3,3], bonus: '3 microbes' },
    'Europa':      { res: 'MC',       track: [1,1,2,2,3,3,4], bonus: 'Place ocean' },
    'Ganymede':    { res: 'Plant',    track: [0,1,2,3,4,5,6], bonus: '1 plant-prod' },
    'Io':          { res: 'Heat',     track: [2,3,4,6,8,10,13], bonus: '2 heat-prod' },
    'Luna':        { res: 'MC',       track: [1,2,4,7,10,13,17], bonus: '2 MC-prod' },
    'Miranda':     { res: 'Animal',   track: [0,0,1,1,1,2,2], bonus: '1 animal' },
    'Pluto':       { res: 'Card',     track: [0,1,2,2,3,3,4], bonus: '2 cards' },
    'Titan':       { res: 'Floater',  track: [0,1,1,2,3,3,4], bonus: '3 floaters' },
    'Triton':      { res: 'Titanium', track: [0,1,1,2,3,4,5], bonus: '3 titanium' },
  };

  let colonyEl = null;
  let colonyVisible = false;

  function buildColonyPanel() {
    if (colonyEl) return colonyEl;
    colonyEl = document.createElement('div');
    colonyEl.className = 'tm-colony-panel';
    document.body.appendChild(colonyEl);
    return colonyEl;
  }

  function updateColonyPanel() {
    if (!colonyVisible || !enabled) {
      if (colonyEl) colonyEl.style.display = 'none';
      return;
    }

    const panel = buildColonyPanel();
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.game.colonies) {
      panel.innerHTML = '<div class="tm-turm-title">Колонии</div><div class="tm-pool-more">Колонии не активны</div>';
      panel.style.display = 'block';
      return;
    }

    const colonies = pv.game.colonies;
    const myColor = pv.thisPlayer ? pv.thisPlayer.color : null;

    let html = '<div class="tm-turm-title">Колонии (' + colonies.length + ')</div>';

    // Trade fleet info
    if (pv.thisPlayer) {
      const fleet = pv.thisPlayer.fleetSize || 1;
      const used = pv.thisPlayer.tradesThisGeneration || 0;
      const left = Math.max(0, fleet - used);
      const tradeCost = 9 - fleet; // base 9 MC, discount = fleet size
      html += '<div class="tm-col-fleet">';
      html += 'Флот: ' + left + '/' + fleet;
      html += ' | Торговля: ' + tradeCost + ' MC / 3E / 3Ti';
      html += '</div>';
    }

    let bestTrade = null;
    let bestTradeVal = -1;

    for (const col of colonies) {
      const name = col.name || '?';
      const info = COLONY_DATA[name];
      const pos = col.trackPosition != null ? col.trackPosition : 0;
      const tradeVal = info ? (info.track[Math.min(pos, info.track.length - 1)] || 0) : pos;
      const mcRate = info ? (RES_MC_VALUE[info.res] || 1) : 1;
      const mcValue = Math.round(tradeVal * mcRate * 10) / 10;
      const slots = col.colonies || [];
      const mySlots = slots.filter(function(c) { return c.player === myColor || c === myColor; }).length;
      const isActive = col.isActive !== false;
      const visitor = col.visitor;

      if (isActive && mcValue > bestTradeVal && visitor == null) {
        bestTradeVal = mcValue;
        bestTrade = { name: name, val: tradeVal, res: info ? info.res : '?', mc: mcValue };
      }

      html += '<div class="tm-col-row' + (isActive ? '' : ' tm-col-inactive') + '">';
      html += '<div class="tm-col-header">';
      html += '<span class="tm-col-name">' + escHtml(name) + '</span>';
      html += '<span class="tm-col-track">' + (info ? info.res : '?') + ': ' + tradeVal + ' <span style="color:#f1c40f;font-size:11px">(~' + mcValue + ' MC)</span></span>';
      html += '</div>';

      // Track position bar
      if (info) {
        const maxPos = info.track.length - 1;
        const pct = maxPos > 0 ? Math.round((pos / maxPos) * 100) : 0;
        html += '<div class="tm-pool-bar" style="margin:2px 0;height:5px"><div class="tm-pool-fill" style="width:' + pct + '%"></div></div>';
      }

      // Colony slots
      html += '<div class="tm-col-slots">';
      for (let i = 0; i < 3; i++) {
        if (i < slots.length) {
          const slotColor = slots[i].player || slots[i];
          const isMine = slotColor === myColor;
          html += '<span class="tm-col-slot" style="background:' + slotColor + (isMine ? ';outline:1px solid #fff' : '') + '"></span>';
        } else {
          html += '<span class="tm-col-slot tm-col-slot-empty"></span>';
        }
      }
      html += '<span class="tm-col-slots-label">' + slots.length + '/3</span>';
      html += '</div>';

      // Visitor indicator
      if (visitor) {
        html += '<div style="font-size:11px;color:#888">Торговля: <span style="color:' + visitor + '">' + visitor + '</span></div>';
      }

      // My colony bonus
      if (mySlots > 0 && info) {
        html += '<div style="font-size:11px;color:#2ecc71">Бонус: ' + info.bonus + ' x' + mySlots + '</div>';
      }

      html += '</div>';
    }

    // Trade advisor — rank all tradeable colonies by net MC value
    {
      const fleet = pv.thisPlayer ? (pv.thisPlayer.fleetSize || 1) : 1;
      const tradeCost = 9 - fleet;
      const tradeOptions = [];
      for (const col of colonies) {
        if (col.isActive === false) continue;
        if (col.visitor != null) continue; // already traded
        const cName = col.name || '?';
        const info = COLONY_DATA[cName];
        if (!info) continue;
        const pos = col.trackPosition != null ? col.trackPosition : 0;
        const tradeVal = info.track[Math.min(pos, info.track.length - 1)] || 0;
        const mcRate = RES_MC_VALUE[info.res] || 1;
        const mcGross = tradeVal * mcRate;
        // Add colony bonus value for my colonies
        const mySlots = (col.colonies || []).filter(function(c) { return c.player === myColor || c === myColor; }).length;
        const bonusMC = mySlots * (mcRate * 0.5); // rough estimate of production bonus
        const netMC = Math.round((mcGross + bonusMC - tradeCost) * 10) / 10;
        tradeOptions.push({ name: cName, res: info.res, tradeVal: tradeVal, grossMC: Math.round(mcGross * 10) / 10, netMC: netMC, mySlots: mySlots });
      }
      tradeOptions.sort(function(a, b) { return b.netMC - a.netMC; });

      if (tradeOptions.length > 0) {
        html += '<div class="tm-col-best">Рейтинг торговли (нетто, −' + tradeCost + ' MC)</div>';
        for (let i = 0; i < Math.min(3, tradeOptions.length); i++) {
          const opt = tradeOptions[i];
          const color = opt.netMC > 0 ? '#2ecc71' : opt.netMC >= -2 ? '#f1c40f' : '#e74c3c';
          html += '<div style="font-size:11px;padding:1px 0">';
          html += (i === 0 ? '★ ' : '') + '<b>' + escHtml(opt.name) + '</b>: ';
          html += opt.tradeVal + ' ' + opt.res + ' = ' + opt.grossMC + ' MC';
          html += ' → <span style="color:' + color + ';font-weight:bold">нетто ' + (opt.netMC > 0 ? '+' : '') + opt.netMC + '</span>';
          if (opt.mySlots > 0) html += ' <span style="color:#3498db">(+' + opt.mySlots + ' кол.)</span>';
          html += '</div>';
        }
      }
    }

    html += '<div class="tm-adv-hint">C — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  function toggleColony() {
    colonyVisible = !colonyVisible;
    savePanelState();
    updateColonyPanel();
  }

  // ── Export Game Summary ──

  function exportGameSummary() {
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      showToast('Нет данных для экспорта', 'info');
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();
    const tr = p.terraformRating || 0;
    const mc = p.megaCredits || 0;
    const corp = detectMyCorp() || '?';
    const vb = p.victoryPointsBreakdown;
    const vpTotal = (vb && vb.total > 0) ? vb.total : tr;
    const handSize = (pv.cardsInHand || []).length;
    const tableauSize = (p.tableau || []).length;

    // Productions
    const prods = [
      'MC:' + (p.megaCreditProduction || 0),
      'St:' + (p.steelProduction || 0),
      'Ti:' + (p.titaniumProduction || 0),
      'Pl:' + (p.plantProduction || 0),
      'En:' + (p.energyProduction || 0),
      'He:' + (p.heatProduction || 0),
    ];

    // Tags
    let tagStr = '';
    if (p.tags) {
      tagStr = p.tags.filter(function(t) { return t.count > 0; })
        .sort(function(a, b) { return b.count - a.count; })
        .map(function(t) { return t.tag + ':' + t.count; }).join(', ');
    }

    // Globals
    let globalsStr = '';
    if (pv.game) {
      const parts = [];
      if (typeof pv.game.temperature === 'number') parts.push('T:' + pv.game.temperature + '°C');
      if (typeof pv.game.oxygenLevel === 'number') parts.push('O₂:' + pv.game.oxygenLevel + '%');
      if (typeof pv.game.oceans === 'number') parts.push('Oc:' + pv.game.oceans + '/9');
      globalsStr = parts.join(' | ');
    }

    const lines = [
      '=== TM Game Summary ===',
      'Gen: ' + gen + ' | Corp: ' + corp,
      'VP: ~' + vpTotal + ' | TR: ' + tr + ' | MC: ' + mc,
      'Prod: ' + prods.join(', '),
      'Cards: ' + handSize + ' hand / ' + tableauSize + ' played',
      'Tags: ' + tagStr,
      'Globals: ' + globalsStr,
      '========================',
    ];

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(function() {
      showToast('📋 Сводка скопирована!', 'info');
    }).catch(function() {
      showToast('Ошибка копирования', 'info');
    });
  }

  // ── Quick Stats Overlay ──

  let quickStatsEl = null;
  let quickStatsVisible = false;

  function showQuickStats() {
    quickStatsVisible = !quickStatsVisible;
    if (!quickStatsVisible) {
      if (quickStatsEl) quickStatsEl.style.display = 'none';
      return;
    }

    if (!quickStatsEl) {
      quickStatsEl = document.createElement('div');
      quickStatsEl.className = 'tm-quick-stats';
      document.body.appendChild(quickStatsEl);
    }

    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      quickStatsEl.innerHTML = '<div style="padding:12px">Нет данных</div>';
      quickStatsEl.style.display = 'block';
      return;
    }

    const p = pv.thisPlayer;
    const gen = detectGeneration();
    const tr = p.terraformRating || 0;
    const mc = p.megaCredits || 0;
    const mcProd = p.megaCreditProduction || 0;
    const cardsInHand = (pv.cardsInHand || []).length;
    const tableau = (p.tableau || []).length;

    // Calculate progress
    let progress = 0;
    if (pv.game) {
      let raises = 0, target = 0;
      if (typeof pv.game.temperature === 'number') { raises += (pv.game.temperature + 30) / 2; target += 19; }
      if (typeof pv.game.oxygenLevel === 'number') { raises += pv.game.oxygenLevel; target += 14; }
      if (typeof pv.game.oceans === 'number') { raises += pv.game.oceans; target += 9; }
      if (target > 0) progress = Math.round(raises / target * 100);
    }

    // Phase
    let phase;
    if (gen <= 2) phase = 'Ранняя';
    else if (progress < 40) phase = 'Развитие';
    else if (progress < 75) phase = 'Середина';
    else phase = 'Финал';

    // VP estimate
    const vb = p.victoryPointsBreakdown;
    const vpTotal = (vb && vb.total > 0) ? vb.total : tr;

    let html = '<div style="font-weight:bold;font-size:14px;margin-bottom:6px">📊 Сводка — Пок. ' + gen + ' (' + phase + ')</div>';
    html += '<div class="tm-qs-row"><span>VP</span><span style="font-size:16px;font-weight:bold;color:#2ecc71">' + vpTotal + '</span></div>';
    html += '<div class="tm-qs-row"><span>TR</span><span>' + tr + '</span></div>';
    html += '<div class="tm-qs-row"><span>MC</span><span>' + mc + ' (+' + mcProd + ' prod +' + tr + ' TR)</span></div>';
    html += '<div class="tm-qs-row"><span>Карт</span><span>' + cardsInHand + ' руке / ' + tableau + ' сыграно</span></div>';
    html += '<div class="tm-qs-row"><span>Прогресс</span><span>' + progress + '%</span></div>';

    // Tags summary
    if (p.tags) {
      const topTags = p.tags.filter(function(t) { return t.count > 0; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 5);
      if (topTags.length > 0) {
        html += '<div style="margin-top:4px;font-size:11px;color:#888">Теги: ' +
          topTags.map(function(t) { return t.tag + ':' + t.count; }).join(', ') + '</div>';
      }
    }
    html += '<div style="margin-top:6px;font-size:10px;color:#666;text-align:center">I — закрыть</div>';

    quickStatsEl.innerHTML = html;
    quickStatsEl.style.display = 'block';
  }

  // ── Help Overlay ──

  let helpEl = null;
  let helpVisible = false;

  function toggleHelp() {
    helpVisible = !helpVisible;
    if (!helpVisible) {
      if (helpEl) helpEl.style.display = 'none';
      return;
    }

    if (!helpEl) {
      helpEl = document.createElement('div');
      helpEl.className = 'tm-help-overlay';
      helpEl.addEventListener('click', (e) => {
        if (e.target === helpEl) { helpVisible = false; helpEl.style.display = 'none'; }
      });
      document.body.appendChild(helpEl);
    }

    const keys = [
      ['T', 'Вкл/выкл оверлей'],
      ['F', 'Поиск карт'],
      ['M', 'Вехи и Награды'],
      ['O', 'Оппоненты'],
      ['S', 'Сортировка руки'],
      ['G', 'Прогноз дохода'],
      ['P', 'Пул карт'],
      ['Q', 'Порядок розыгрыша'],
      ['D', 'Теги и продукция'],
      ['V', 'Оценка VP'],
      ['W', 'Глобальные параметры'],
      ['B', 'Подсветка играбельных карт'],
      ['R', 'Турмоил-трекер'],
      ['C', 'Колонии'],
      ['I', 'Быстрая сводка'],
      ['X', 'Экспорт в буфер обмена'],
      ['L', 'Компактный режим'],
      ['H', 'Справка (это окно)'],
      ['1-6', 'Фильтр по тирам S/A/B/C/D/F'],
      ['Ctrl+клик', 'Сравнить две карты'],
      ['Esc', 'Закрыть панели'],
    ];

    let html = '<div class="tm-help-inner">';
    html += '<div class="tm-help-title">TM Tier Overlay v4.0 — Горячие клавиши</div>';
    for (const [key, desc] of keys) {
      html += '<div class="tm-help-row">';
      html += '<kbd class="tm-help-key">' + key + '</kbd>';
      html += '<span class="tm-help-desc">' + desc + '</span>';
      html += '</div>';
    }
    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #444">';
    html += '<div class="tm-help-desc" style="font-size:11px;color:#888">Tooltip: тиры, экономика, эффективность, Reddit, синергии, комбо, требования, триггеры, дискаунты, стоимость</div>';
    html += '<div class="tm-help-desc" style="font-size:11px;color:#888">Авто: actions, возраст карт, продажа D/F, фаза игры, глоб. события, TR/пок., ETA</div>';
    html += '<div class="tm-help-desc" style="font-size:11px;color:#888">Панели: VP breakdown + прогноз, TR история, теги, конвертация, угрозы оппонентов</div>';
    html += '</div>';
    html += '<div class="tm-help-footer">Клик за пределами окна — закрыть</div>';
    html += '</div>';

    helpEl.innerHTML = html;
    helpEl.style.display = 'flex';
  }

  // ── Hotkeys ──

  const TIER_KEYS = { Digit1: 'S', Digit2: 'A', Digit3: 'B', Digit4: 'C', Digit5: 'D', Digit6: 'F' };

  document.addEventListener('keydown', (e) => {
    // Ignore when typing in input or when modifier keys are held (avoid browser conflicts)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    //T → toggle overlay
    if (e.code === 'KeyT') {
      e.preventDefault();
      enabled = !enabled;
      safeStorage((storage) => { storage.local.set({ enabled: enabled }); });
      enabled ? processAll() : removeAll();
      return;
    }

    //H → help overlay
    if (e.code === 'KeyH') {
      e.preventDefault();
      toggleHelp();
      return;
    }

    //F → card search
    if (e.code === 'KeyF') {
      e.preventDefault();
      searchOpen ? closeSearch() : openSearch();
      return;
    }

    //M → milestone/award advisor
    if (e.code === 'KeyM') {
      e.preventDefault();
      toggleAdvisor();
      return;
    }

    //O → opponent tracker
    if (e.code === 'KeyO') {
      e.preventDefault();
      oppTrackerVisible = !oppTrackerVisible;
      savePanelState();
      updateOppTracker();
      return;
    }

    //S → hand sort
    if (e.code === 'KeyS') {
      e.preventDefault();
      handSortActive = !handSortActive;
      updateHandSort();
      return;
    }

    //G → income projection
    if (e.code === 'KeyG') {
      e.preventDefault();
      incomeVisible = !incomeVisible;
      savePanelState();
      updateIncomeProjection();
      return;
    }

    //P → card pool tracker
    if (e.code === 'KeyP') {
      e.preventDefault();
      poolVisible = !poolVisible;
      savePanelState();
      updateCardPool();
      return;
    }

    //Q → play order
    if (e.code === 'KeyQ') {
      e.preventDefault();
      playOrderVisible = !playOrderVisible;
      savePanelState();
      analyzePlayOrder();
      return;
    }

    //D → tag counter
    if (e.code === 'KeyD') {
      e.preventDefault();
      tagCounterVisible = !tagCounterVisible;
      savePanelState();
      updateTagCounter();
      return;
    }

    //W → global parameters
    if (e.code === 'KeyW') {
      e.preventDefault();
      globalsVisible = !globalsVisible;
      savePanelState();
      updateGlobals();
      return;
    }

    //V → VP tracker
    if (e.code === 'KeyV') {
      e.preventDefault();
      vpVisible = !vpVisible;
      savePanelState();
      updateVPTracker();
      return;
    }

    //B → playable card highlight
    if (e.code === 'KeyB') {
      e.preventDefault();
      playableVisible = !playableVisible;
      savePanelState();
      updatePlayableHighlight();
      return;
    }

    //R → turmoil tracker
    if (e.code === 'KeyR') {
      e.preventDefault();
      turmoilVisible = !turmoilVisible;
      savePanelState();
      updateTurmoilTracker();
      return;
    }

    //C → colony advisor
    if (e.code === 'KeyC') {
      e.preventDefault();
      toggleColony();
      return;
    }

    // X → export game summary to clipboard
    if (e.code === 'KeyX') {
      e.preventDefault();
      exportGameSummary();
      return;
    }

    // L → compact mode
    if (e.code === 'KeyL') {
      e.preventDefault();
      toggleCompact();
      return;
    }

    // I → quick stats overlay
    if (e.code === 'KeyI') {
      e.preventDefault();
      showQuickStats();
      return;
    }

    // Escape → close panels
    if (e.code === 'Escape') {
      if (searchOpen) { closeSearch(); e.preventDefault(); return; }
      if (advisorVisible) { advisorVisible = false; updateAdvisor(); e.preventDefault(); return; }
      if (oppTrackerVisible) { oppTrackerVisible = false; updateOppTracker(); e.preventDefault(); return; }
      if (incomeVisible) { incomeVisible = false; updateIncomeProjection(); e.preventDefault(); return; }
      if (poolVisible) { poolVisible = false; updateCardPool(); e.preventDefault(); return; }
      if (playOrderVisible) { playOrderVisible = false; analyzePlayOrder(); e.preventDefault(); return; }
      if (tagCounterVisible) { tagCounterVisible = false; updateTagCounter(); e.preventDefault(); return; }
      if (vpVisible) { vpVisible = false; savePanelState(); updateVPTracker(); e.preventDefault(); return; }
      if (globalsVisible) { globalsVisible = false; savePanelState(); updateGlobals(); e.preventDefault(); return; }
      if (playableVisible) { playableVisible = false; savePanelState(); updatePlayableHighlight(); e.preventDefault(); return; }
      if (turmoilVisible) { turmoilVisible = false; savePanelState(); updateTurmoilTracker(); e.preventDefault(); return; }
      if (colonyVisible) { colonyVisible = false; savePanelState(); updateColonyPanel(); e.preventDefault(); return; }
      if (quickStatsVisible) { quickStatsVisible = false; if (quickStatsEl) quickStatsEl.style.display = 'none'; e.preventDefault(); return; }
      if (helpVisible) { helpVisible = false; if (helpEl) helpEl.style.display = 'none'; e.preventDefault(); return; }
    }

    //1..6 → toggle tier filter
    if (TIER_KEYS[e.code]) {
      e.preventDefault();
      const tier = TIER_KEYS[e.code];
      tierFilter[tier] = !tierFilter[tier];
      safeStorage((storage) => { storage.local.set({ tierFilter: tierFilter }); });
      reapplyFilter();
      return;
    }
  });

  // ── Game End Stats ──

  let gameEndNotified = false;

  function checkGameEnd() {
    if (gameEndNotified) return;
    const pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;
    const g = pv.game;
    const tempMax = typeof g.temperature === 'number' && g.temperature >= 8;
    const oxyMax = typeof g.oxygenLevel === 'number' && g.oxygenLevel >= 14;
    const oceansMax = typeof g.oceans === 'number' && g.oceans >= 9;
    if (!tempMax || !oxyMax || !oceansMax) return;

    gameEndNotified = true;
    const gen = detectGeneration();
    const elapsed = Date.now() - gameStartTime;
    const p = pv.thisPlayer;
    const tr = p.terraformRating || 0;
    const cardsPlayed = p.tableau ? p.tableau.length : 0;
    const mins = Math.round(elapsed / 60000);
    showToast('🏁 Конец игры! Пок. ' + gen + ' | TR ' + tr + ' | ' + cardsPlayed + ' карт | ' + mins + ' мин', 'great');
  }

  // ── Compact Mode ──

  let compactMode = false;

  function toggleCompact() {
    compactMode = !compactMode;
    document.body.classList.toggle('tm-compact', compactMode);
    showToast(compactMode ? 'Компактный режим включён' : 'Компактный режим выключен', 'info');
  }

  // ── Floating Resource Bar ──

  let resBarEl = null;

  function updateResourceBar() {
    if (!enabled) {
      if (resBarEl) resBarEl.style.display = 'none';
      return;
    }
    const pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) {
      if (resBarEl) resBarEl.style.display = 'none';
      return;
    }
    if (!resBarEl) {
      resBarEl = document.createElement('div');
      resBarEl.className = 'tm-res-bar';
      document.body.appendChild(resBarEl);
    }
    const p = pv.thisPlayer;
    const items = [
      { icon: '💰', val: p.megaCredits || 0, prod: (p.megaCreditProduction || 0) + (p.terraformRating || 0), color: '#f1c40f' },
      { icon: '⚒', val: p.steel || 0, prod: p.steelProduction || 0, color: '#8b7355' },
      { icon: '🔩', val: p.titanium || 0, prod: p.titaniumProduction || 0, color: '#aaa' },
      { icon: '🌿', val: p.plants || 0, prod: p.plantProduction || 0, color: '#4caf50' },
      { icon: '⚡', val: p.energy || 0, prod: p.energyProduction || 0, color: '#9b59b6' },
      { icon: '🔥', val: p.heat || 0, prod: p.heatProduction || 0, color: '#e67e22' },
    ];
    let html = '';
    for (const it of items) {
      html += '<span class="tm-res-item" style="color:' + it.color + '">' + it.icon + ' ' + it.val;
      if (it.prod > 0) html += '<span class="tm-res-prod">+' + it.prod + '</span>';
      html += '</span>';
    }
    // TR
    html += '<span class="tm-res-item" style="color:#3498db">TR ' + (p.terraformRating || 0) + '</span>';
    resBarEl.innerHTML = html;
    resBarEl.style.display = 'flex';
  }

  // ── MutationObserver ──

  function debounce(fn, ms) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  const debouncedProcess = debounce(processAll, 200);
  const observer = new MutationObserver(debouncedProcess);
  observer.observe(document.body, { childList: true, subtree: true });

  // Generation timer: update every second
  setInterval(() => {
    if (enabled) updateGenTimer();
  }, 1000);

  processAll();

  // Hotkey hint — auto-hide after 2 minutes
  const hintEl = document.createElement('div');
  hintEl.className = 'tm-hotkey-hint';
  hintEl.textContent = 'H = Справка';
  hintEl.addEventListener('click', function() { hintEl.remove(); toggleHelp(); });
  document.body.appendChild(hintEl);
  setTimeout(function() { if (hintEl.parentNode) hintEl.style.opacity = '0'; }, 120000);
  setTimeout(function() { if (hintEl.parentNode) hintEl.remove(); }, 123000);
})();

// ═══════════════════════════════════════════════════════════════════
// Game Creation Auto-Fill — сохраняет и восстанавливает настройки
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STORAGE_KEY = 'tm_create_game_settings';
  let applied = false;
  let vueInstance = null;

  function safeStorage(fn) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
        fn(chrome.storage);
      }
    } catch (e) { /* extension context invalidated */ }
  }

  // Map server format (from tm_settings.json) to client Vue model fields
  function serverToClient(s) {
    const c = Object.assign({}, s);
    // Array field name mapping: server → client
    if (c.customCorporationsList) {
      c.customCorporations = c.customCorporationsList;
      delete c.customCorporationsList;
    }
    if (c.customColoniesList) {
      c.customColonies = c.customColoniesList;
      delete c.customColoniesList;
    }
    return c;
  }

  // Map client Vue model to server format for saving
  function clientToServer(vm) {
    return {
      players: (vm.players || []).map(function (p) {
        return { name: p.name, color: p.color, beginner: p.beginner, handicap: p.handicap, first: p.first };
      }),
      expansions: Object.assign({}, vm.expansions),
      draftVariant: vm.draftVariant,
      showOtherPlayersVP: vm.showOtherPlayersVP,
      customCorporationsList: (vm.customCorporations || []).slice(),
      customColoniesList: (vm.customColonies || []).slice(),
      customPreludes: (vm.customPreludes || []).slice(),
      bannedCards: getBannedCards(vm),
      includedCards: getIncludedCards(vm),
      board: vm.board,
      solarPhaseOption: vm.solarPhaseOption,
      undoOption: vm.undoOption,
      showTimers: vm.showTimers,
      fastModeOption: vm.fastModeOption,
      includeFanMA: vm.includeFanMA,
      randomMA: vm.randomMA,
      shuffleMapOption: vm.shuffleMapOption,
      randomFirstPlayer: vm.randomFirstPlayer,
      initialDraft: vm.initialDraft,
      preludeDraftVariant: vm.preludeDraftVariant,
      ceosDraftVariant: vm.ceosDraftVariant,
      twoCorpsVariant: vm.twoCorpsVariant,
      startingCorporations: vm.startingCorporations,
      startingPreludes: vm.startingPreludes,
      aresExtremeVariant: vm.aresExtremeVariant,
      politicalAgendasExtension: vm.politicalAgendasExtension,
      removeNegativeGlobalEventsOption: vm.removeNegativeGlobalEventsOption,
      requiresVenusTrackCompletion: vm.requiresVenusTrackCompletion,
      requiresMoonTrackCompletion: vm.requiresMoonTrackCompletion,
      altVenusBoard: vm.altVenusBoard,
      customCeos: (vm.customCeos || []).slice(),
      startingCeos: vm.startingCeos,
    };
  }

  function getBannedCards(vm) {
    try {
      if (vm.$refs && vm.$refs.cardsFilter && vm.$refs.cardsFilter.selected) {
        return vm.$refs.cardsFilter.selected.slice();
      }
    } catch (e) {}
    return [];
  }

  function getIncludedCards(vm) {
    try {
      if (vm.$refs && vm.$refs.cardsFilter2 && vm.$refs.cardsFilter2.selected) {
        return vm.$refs.cardsFilter2.selected.slice();
      }
    } catch (e) {}
    return [];
  }

  function applySettings(vm, settings) {
    const s = serverToClient(settings);

    // 1) Set player count first (triggers watchers that create player slots)
    if (s.players && s.players.length) {
      vm.playersCount = s.players.length;
    }

    // 2) Apply expansions — triggers watchers
    if (s.expansions) {
      Object.keys(s.expansions).forEach(function (k) {
        if (vm.expansions.hasOwnProperty(k)) {
          vm.expansions[k] = s.expansions[k];
        }
      });
    }

    // 3) Apply simple boolean/string fields after small delay (let watchers settle)
    setTimeout(function () {
      var boolFields = [
        'draftVariant', 'showOtherPlayersVP', 'solarPhaseOption', 'undoOption',
        'showTimers', 'fastModeOption', 'includeFanMA', 'shuffleMapOption',
        'randomFirstPlayer', 'initialDraft', 'preludeDraftVariant', 'ceosDraftVariant',
        'twoCorpsVariant', 'aresExtremeVariant', 'removeNegativeGlobalEventsOption',
        'requiresVenusTrackCompletion', 'requiresMoonTrackCompletion', 'altVenusBoard'
      ];
      boolFields.forEach(function (f) {
        if (s.hasOwnProperty(f) && vm.hasOwnProperty(f)) vm[f] = s[f];
      });

      var otherFields = ['board', 'randomMA', 'politicalAgendasExtension',
        'startingCorporations', 'startingPreludes', 'startingCeos'];
      otherFields.forEach(function (f) {
        if (s.hasOwnProperty(f) && vm.hasOwnProperty(f)) vm[f] = s[f];
      });

      // 4) Apply custom arrays
      if (s.customCorporations && s.customCorporations.length) {
        vm.customCorporations = s.customCorporations.slice();
      }
      if (s.customColonies && s.customColonies.length) {
        vm.customColonies = s.customColonies.slice();
      }
      if (s.customPreludes && s.customPreludes.length) {
        vm.customPreludes = s.customPreludes.slice();
      }
      if (s.customCeos && s.customCeos.length) {
        vm.customCeos = s.customCeos.slice();
      }

      // 5) Apply player names/colors
      if (s.players && s.players.length && vm.players) {
        for (var i = 0; i < Math.min(s.players.length, vm.players.length); i++) {
          if (s.players[i].name) vm.players[i].name = s.players[i].name;
          if (s.players[i].color) vm.players[i].color = s.players[i].color;
        }
      }

      // 6) Re-apply solarPhaseOption (watcher on venus overwrites it)
      if (s.hasOwnProperty('solarPhaseOption')) {
        vm.$nextTick(function () {
          vm.solarPhaseOption = s.solarPhaseOption;
        });
      }

      // 7) Handle bannedCards / includedCards — need CardsFilter components rendered
      if (s.bannedCards && s.bannedCards.length) {
        vm.showBannedCards = true;
        vm.$nextTick(function () {
          setTimeout(function () {
            if (vm.$refs && vm.$refs.cardsFilter) {
              vm.$refs.cardsFilter.selected = s.bannedCards.slice();
            }
          }, 100);
        });
      }
      if (s.includedCards && s.includedCards.length) {
        vm.showIncludedCards = true;
        vm.$nextTick(function () {
          setTimeout(function () {
            if (vm.$refs && vm.$refs.cardsFilter2) {
              vm.$refs.cardsFilter2.selected = s.includedCards.slice();
            }
          }, 100);
        });
      }

      showNotification('Настройки загружены автоматически');
    }, 200);
  }

  function showNotification(text) {
    var el = document.createElement('div');
    el.className = 'tm-autofill-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; }, 3000);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 3500);
  }

  function hookCreateButton(vm) {
    // Intercept fetch to save settings when game is created
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (typeof url === 'string' && url.indexOf('creategame') !== -1 && opts && opts.method === 'POST') {
        // Save current settings
        var settings = clientToServer(vm);
        safeStorage(function (storage) {
          storage.local.set({ tm_create_game_settings: settings });
        });
      }
      return origFetch.apply(this, arguments);
    };
  }

  function addSaveLoadButtons(vm) {
    // Find the existing download/upload buttons area
    var createDiv = document.querySelector('#create-game');
    if (!createDiv) return;

    var toolbar = document.createElement('div');
    toolbar.className = 'tm-autofill-toolbar';
    toolbar.innerHTML =
      '<button class="tm-af-btn tm-af-save" title="Сохранить настройки в расширение">💾 Сохранить</button>' +
      '<button class="tm-af-btn tm-af-load" title="Загрузить последние настройки">📋 Загрузить</button>' +
      '<button class="tm-af-btn tm-af-import" title="Импорт из tm_settings.json">📂 Импорт JSON</button>' +
      '<input type="file" accept=".json" class="tm-af-file" style="display:none">';

    var h1 = createDiv.querySelector('h1');
    if (h1) {
      h1.parentNode.insertBefore(toolbar, h1.nextSibling);
    } else {
      createDiv.insertBefore(toolbar, createDiv.firstChild);
    }

    // Save button
    toolbar.querySelector('.tm-af-save').addEventListener('click', function () {
      var settings = clientToServer(vm);
      safeStorage(function (storage) {
        storage.local.set({ tm_create_game_settings: settings }, function () {
          showNotification('Настройки сохранены');
        });
      });
    });

    // Load button
    toolbar.querySelector('.tm-af-load').addEventListener('click', function () {
      safeStorage(function (storage) {
        storage.local.get(STORAGE_KEY, function (data) {
          if (data && data[STORAGE_KEY]) {
            applySettings(vm, data[STORAGE_KEY]);
          } else {
            showNotification('Нет сохранённых настроек');
          }
        });
      });
    });

    // Import JSON button
    var fileInput = toolbar.querySelector('.tm-af-file');
    toolbar.querySelector('.tm-af-import').addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var json = JSON.parse(ev.target.result);
          applySettings(vm, json);
        } catch (err) {
          showNotification('Ошибка: невалидный JSON');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  function getVueInstance(el) {
    // Vue 2: __vue__ on component root element
    if (el.__vue__) return el.__vue__;
    // Try children
    var children = el.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      if (children[i].__vue__ && children[i].__vue__.playersCount !== undefined) {
        return children[i].__vue__;
      }
    }
    return null;
  }

  function tryInit() {
    if (applied) return;
    var createEl = document.querySelector('#create-game');
    if (!createEl) return;

    var vm = getVueInstance(createEl);
    if (!vm || vm.playersCount === undefined) return;

    applied = true;
    vueInstance = vm;

    // Hook fetch to auto-save on game create
    hookCreateButton(vm);

    // Add toolbar buttons
    addSaveLoadButtons(vm);

    // Auto-load last settings
    safeStorage(function (storage) {
      storage.local.get(STORAGE_KEY, function (data) {
        if (data && data[STORAGE_KEY]) {
          applySettings(vm, data[STORAGE_KEY]);
        }
      });
    });
  }

  // Watch for create-game-form to appear (SPA navigation)
  var obs = new MutationObserver(function () {
    if (!applied) tryInit();
    // Reset if navigated away and back
    if (applied && !document.querySelector('#create-game')) {
      applied = false;
      vueInstance = null;
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Also try immediately
  setTimeout(tryInit, 500);
  setTimeout(tryInit, 1500);
})();
