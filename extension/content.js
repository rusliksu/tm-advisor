// TM Tier Overlay — Content Script v1.8
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
  let tierFilter = { S: true, A: true, B: true, C: true, D: true, F: true };

  // Panel state keys for persistence
  const PANEL_DEFAULTS = {
    enabled: true, tierFilter: tierFilter,
    panel_advisor: false, panel_opp: false, panel_income: false,
    panel_pool: false, panel_playorder: false, panel_tags: false,
    panel_vp: false, panel_globals: false,
  };

  function savePanelState() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.set({
      panel_advisor: advisorVisible, panel_opp: oppTrackerVisible,
      panel_income: incomeVisible, panel_pool: poolVisible,
      panel_playorder: playOrderVisible, panel_tags: tagCounterVisible,
      panel_vp: vpVisible, panel_globals: globalsVisible,
    });
  }

  // Load settings
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(PANEL_DEFAULTS, (s) => {
      enabled = s.enabled;
      tierFilter = s.tierFilter;
      // Restore panel states
      advisorVisible = s.panel_advisor;
      oppTrackerVisible = s.panel_opp;
      incomeVisible = s.panel_income;
      poolVisible = s.panel_pool;
      playOrderVisible = s.panel_playorder;
      tagCounterVisible = s.panel_tags;
      vpVisible = s.panel_vp;
      globalsVisible = s.panel_globals;
      loadSeenCards();
      if (enabled) processAll();
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
        enabled ? processAll() : removeAll();
      }
      if (changes.tierFilter) {
        tierFilter = changes.tierFilter.newValue;
        reapplyFilter();
      }
    });
  }

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
    badge.addEventListener('mouseenter', (e) => showTooltip(e, name, data));
    badge.addEventListener('mouseleave', hideTooltip);
    badge.addEventListener('click', (e) => {
      if (e.ctrlKey) { e.stopPropagation(); addToCompare(name); }
    });

    cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
    cardEl.setAttribute('data-tm-card', name);
    cardEl.setAttribute('data-tm-tier', t);

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

    let html = '<div class="tm-tip-header">';
    html += '<span class="tm-tip-tier tm-tier-' + data.t + '">' + data.t + ' ' + data.s + '</span> ';
    if (costText) html += '<span class="tm-tip-cost">' + costText + '</span> ';
    html += '<span class="tm-tip-name">' + escHtml(ruName(name)) + '</span>';
    if (ruName(name) !== name) {
      html += '<br><span class="tm-tip-ru">' + escHtml(name) + '</span>';
    }
    html += '</div>';

    if (data.e) {
      html += '<div class="tm-tip-row"><b>Экон:</b> ' + escHtml(data.e) + '</div>';
    }
    if (data.w) {
      html += '<div class="tm-tip-row"><b>Когда:</b> ' + escHtml(data.w) + '</div>';
    }
    if (data.y && data.y.length && data.y[0] !== 'None significant') {
      html += '<div class="tm-tip-row"><b>Синергии:</b> ' + data.y.map(escHtml).join(', ') + '</div>';
    }

    // Corp synergy indicator
    const myCorp = detectMyCorp();
    if (myCorp && data.y && data.y.some((syn) => syn === myCorp)) {
      html += '<div class="tm-tip-row tm-tip-corp-syn">&#9733; Синергия с ' + escHtml(ruName(myCorp)) + '</div>';
    }

    // Dynamic value based on generation
    const gen = detectGeneration();
    if (gen > 0) {
      const mul = getValueMultipliers(gen);
      html += '<div class="tm-tip-row tm-tip-gen">Пок. ' + gen + ' | 1 прод=' + mul.mcProd.toFixed(1) + ' MC | 1 VP=' + mul.vp.toFixed(1) + ' MC</div>';
    }

    tip.innerHTML = html;
    tip.style.display = 'block';

    const rect = e.target.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;

    const tipWidth = 320;
    if (left + tipWidth > window.innerWidth) {
      left = rect.left - tipWidth - 8;
    }
    if (top + 200 > window.innerHeight) {
      top = window.innerHeight - 220;
    }
    if (top < 5) top = 5;

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
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

  /**
   * Highlight cards that synergize with the player's corporation
   */
  function highlightCorpSynergies() {
    // Remove old highlights
    document.querySelectorAll('.tm-corp-synergy').forEach((el) => {
      el.classList.remove('tm-corp-synergy');
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
  }

  // ── Combo highlighting (with rating colors) ──

  function checkCombos() {
    if (typeof TM_COMBOS === 'undefined') return;

    document.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach((el) => {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    document.querySelectorAll('.tm-combo-tooltip').forEach((el) => el.remove());

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
  }

  // ── Draft summary panel ──

  let summaryEl = null;

  function updateDraftSummary() {
    if (!enabled) {
      if (summaryEl) summaryEl.style.display = 'none';
      return;
    }

    // Only show during card selection (SelectCard components)
    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) {
      if (summaryEl) summaryEl.style.display = 'none';
      return;
    }

    // Collect visible cards in selection areas
    const tierCounts = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    let totalScore = 0;
    let cardCount = 0;
    let selectedScore = 0;
    let selectedCount = 0;

    selectCards.forEach((section) => {
      section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        const data = name ? TM_RATINGS[name] : null;
        if (!data) return;

        tierCounts[data.t] = (tierCounts[data.t] || 0) + 1;
        totalScore += data.s;
        cardCount++;

        // Check if card is selected (input:checked in its label)
        const label = el.closest('label');
        if (label) {
          const input = label.querySelector('input:checked');
          if (input) {
            selectedScore += data.s;
            selectedCount++;
          }
        }
      });
    });

    if (cardCount === 0) {
      if (summaryEl) summaryEl.style.display = 'none';
      return;
    }

    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.className = 'tm-draft-summary';
      document.body.appendChild(summaryEl);
    }

    const avgScore = Math.round(totalScore / cardCount);

    let html = '<div class="tm-ds-title">Обзор драфта</div>';
    html += '<div class="tm-ds-row">';
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) {
      if (tierCounts[t] > 0) {
        html += '<span class="tm-ds-tier tm-tier-' + t + '">' + t + ':' + tierCounts[t] + '</span>';
      }
    }
    html += '</div>';
    html += '<div class="tm-ds-avg">Средн: ' + avgScore + ' (' + cardCount + ' карт)</div>';

    if (selectedCount > 0) {
      const selAvg = Math.round(selectedScore / selectedCount);
      html += '<div class="tm-ds-sel">Выбрано: средн ' + selAvg + ' (' + selectedCount + ' карт)</div>';
    }

    summaryEl.innerHTML = html;
    summaryEl.style.display = 'block';
  }

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
    updateDraftSummary();
    updateDraftRecommendations();
    updateAdvisor();
    updateOppTracker();
    updateHandSort();
    trackSeenCards();
    updateIncomeProjection();
    updateCardPool();
    analyzePlayOrder();
    updateTagCounter();
    updateDraftLens();
    updateVPTracker();
    updateGlobals();
    updateActionReminder();
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
    document.querySelectorAll('[data-tm-processed]').forEach((el) => {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    document.querySelectorAll('.tm-rec-badge').forEach((el) => el.remove());
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));
    document.querySelectorAll('.tm-sort-badge').forEach((el) => el.remove());
    if (summaryEl) summaryEl.style.display = 'none';
    if (advisorEl) advisorEl.style.display = 'none';
    if (oppTrackerEl) oppTrackerEl.style.display = 'none';
    if (incomeEl) incomeEl.style.display = 'none';
    if (poolEl) poolEl.style.display = 'none';
    if (playOrderEl) playOrderEl.style.display = 'none';
    if (tagCounterEl) tagCounterEl.style.display = 'none';
    if (lensEl) lensEl.style.display = 'none';
    if (timerEl) timerEl.style.display = 'none';
    if (vpEl) vpEl.style.display = 'none';
    if (globalsEl) globalsEl.style.display = 'none';
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
    'Terraformer': { type: 'milestone', map: 'Tharsis', desc: 'TR >= 35', check: 'tr', target: 35 },
    'Mayor': { type: 'milestone', map: 'Tharsis', desc: '3 cities', check: 'cities', target: 3 },
    'Gardener': { type: 'milestone', map: 'Tharsis', desc: '3 greeneries', check: 'greeneries', target: 3 },
    'Builder': { type: 'milestone', map: 'Tharsis', desc: '8 building tags', check: 'tags', tag: 'building', target: 8 },
    'Planner': { type: 'milestone', map: 'Tharsis', desc: '16 cards in hand', check: 'hand', target: 16 },
    // Hellas milestones
    'Diversifier': { type: 'milestone', map: 'Hellas', desc: '8 different tags', check: 'uniqueTags', target: 8 },
    'Tactician': { type: 'milestone', map: 'Hellas', desc: '5 cards with requirements', check: 'reqCards', target: 5 },
    'Energizer': { type: 'milestone', map: 'Hellas', desc: '6 energy production', check: 'prod', resource: 'energy', target: 6 },
    'Rim Settler': { type: 'milestone', map: 'Hellas', desc: '3 Jovian tags', check: 'tags', tag: 'jovian', target: 3 },
    // Elysium milestones
    'Generalist': { type: 'milestone', map: 'Elysium', desc: 'All 6 productions +1', check: 'generalist' },
    'Specialist': { type: 'milestone', map: 'Elysium', desc: '10 in any production', check: 'maxProd', target: 10 },
    'Ecologist': { type: 'milestone', map: 'Elysium', desc: '4 bio tags', check: 'bioTags', target: 4 },
    'Tycoon': { type: 'milestone', map: 'Elysium', desc: '15 project cards', check: 'tableau', target: 15 },
    'Legend': { type: 'milestone', map: 'Elysium', desc: '5 events', check: 'events', target: 5 },
    // Tharsis awards
    'Landlord': { type: 'award', map: 'Tharsis', desc: 'Most tiles', check: 'tiles' },
    'Scientist': { type: 'award', map: 'Tharsis', desc: 'Most science tags', check: 'tags', tag: 'science' },
    'Banker': { type: 'award', map: 'Tharsis', desc: 'Most MC production', check: 'prod', resource: 'megacredits' },
    'Thermalist': { type: 'award', map: 'Tharsis', desc: 'Most heat', check: 'resource', resource: 'heat' },
    'Miner': { type: 'award', map: 'Tharsis', desc: 'Most steel + titanium', check: 'steelTi' },
    // Hellas awards
    'Cultivator': { type: 'award', map: 'Hellas', desc: 'Most greeneries', check: 'greeneries' },
    'Magnate': { type: 'award', map: 'Hellas', desc: 'Most green cards', check: 'greenCards' },
    'Space Baron': { type: 'award', map: 'Hellas', desc: 'Most space tags', check: 'tags', tag: 'space' },
    'Contractor': { type: 'award', map: 'Hellas', desc: 'Most building tags', check: 'tags', tag: 'building' },
    // Elysium awards
    'Celebrity': { type: 'award', map: 'Elysium', desc: 'Most cards costing 20+', check: 'expensiveCards' },
    'Industrialist': { type: 'award', map: 'Elysium', desc: 'Most steel + energy', check: 'steelEnergy' },
    'Benefactor': { type: 'award', map: 'Elysium', desc: 'Highest TR', check: 'tr' },
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
      html += '</div>';
    }

    if (!hasContent) {
      panel.style.display = 'none';
      return;
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

  function scoreDraftCard(cardName, myTableau, myHand, myCorp) {
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

    // Combo potential (+6 for any combo with cards we have)
    if (typeof TM_COMBOS !== 'undefined') {
      for (const combo of TM_COMBOS) {
        if (!combo.cards.includes(cardName)) continue;
        const otherCards = combo.cards.filter((c) => c !== cardName);
        if (otherCards.some((c) => allMyCards.includes(c))) {
          const ratingBonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
          bonus += ratingBonus;
          reasons.push('Комбо: ' + combo.v);
          break; // Only count best combo
        }
      }
    }

    return { total: baseScore + bonus, reasons };
  }

  function updateDraftRecommendations() {
    if (!enabled) return;

    // Remove old recommendations
    document.querySelectorAll('.tm-rec-badge').forEach((el) => el.remove());
    document.querySelectorAll('.tm-rec-best').forEach((el) => el.classList.remove('tm-rec-best'));

    const selectCards = document.querySelectorAll('.wf-component--select-card');
    if (selectCards.length === 0) return;

    const myCorp = detectMyCorp();
    const myTableau = getMyTableauNames();
    const myHand = getMyHandNames();

    // Score each card in selection
    const scored = [];
    selectCards.forEach((section) => {
      section.querySelectorAll('.card-container[data-tm-card]').forEach((el) => {
        const name = el.getAttribute('data-tm-card');
        if (!name) return;
        const result = scoreDraftCard(name, myTableau, myHand, myCorp);
        scored.push({ el, name, ...result });
      });
    });

    if (scored.length === 0) return;

    // Sort by score desc
    scored.sort((a, b) => b.total - a.total);

    // Mark top pick(s) — best card, and any within 5 points of best
    const bestScore = scored[0].total;

    scored.forEach((item, idx) => {
      if (item.total >= bestScore - 5 && item.reasons.length > 0) {
        item.el.classList.add('tm-rec-best');

        const badge = document.createElement('div');
        badge.className = 'tm-rec-badge';
        if (idx === 0) {
          badge.innerHTML = '&#9733;'; // Star for #1
          badge.classList.add('tm-rec-top');
        } else {
          badge.textContent = '#' + (idx + 1);
        }
        badge.title = item.reasons.join(' | ') + ' (оценка: ' + item.total + ')';
        item.el.appendChild(badge);
      }
    });
  }

  // ── Opponent strategy tracker ──

  let oppTrackerEl = null;
  let oppTrackerVisible = false;

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

      // Production focus
      if (opp.steelProduction >= 3) strategyHints.push('Сталь');
      if (opp.titaniumProduction >= 2) strategyHints.push('Титан');
      if (opp.plantProduction >= 4) strategyHints.push('Растения');
      if (opp.heatProduction >= 5) strategyHints.push('Тепло');
      if (opp.megaCreditProduction >= 10) strategyHints.push('MC' + opp.megaCreditProduction);
      if (opp.energyProduction >= 4) strategyHints.push('Энергия');

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
      html += '</div>';
    }

    html += '<div class="tm-adv-hint">O — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
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
    const r1 = scoreDraftCard(name1, myTableau, myHand, myCorp);
    const r2 = scoreDraftCard(name2, myTableau, myHand, myCorp);

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

    html += '<div class="tm-adv-hint">G — вкл/выкл</div>';

    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  // ── Card Pool Tracker ──

  let poolEl = null;
  let poolVisible = false;
  const seenCards = new Set();

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
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const obj = {};
      obj[getPoolKey()] = Array.from(seenCards);
      chrome.storage.local.set(obj);
    }
  }

  function loadSeenCards() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const key = getPoolKey();
      chrome.storage.local.get(key, (result) => {
        if (result[key] && Array.isArray(result[key])) {
          for (const name of result[key]) seenCards.add(name);
        }
      });
    }
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
        html += '<div class="tm-pool-tier-row">';
        html += '<span class="tm-tip-tier tm-tier-' + t + '">' + t + '</span>';
        html += '<span class="tm-pool-tier-num">' + unseenTiers[t] + '/' + totalTiers[t] + ' ост.</span>';
        html += '</div>';
      }
    }
    html += '</div>';

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

      // Add reminder dot
      const dot = document.createElement('div');
      dot.className = 'tm-action-reminder';
      dot.title = 'Действие доступно';
      el.appendChild(dot);
    }
  }

  // ── Generation Timer ──

  let timerEl = null;
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

    if (!timerEl) {
      timerEl = document.createElement('div');
      timerEl.className = 'tm-timer';
      document.body.appendChild(timerEl);
    }

    const elapsed = Date.now() - genStartTime;
    const totalElapsed = Date.now() - gameStartTime;

    const fmt = (ms) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return m + ':' + String(s % 60).padStart(2, '0');
    };

    let avgText = '';
    if (genTimes.length > 0) {
      const avgMs = genTimes.reduce((sum, g) => sum + g.duration, 0) / genTimes.length;
      avgText = ' | Средн: ' + fmt(avgMs);
    }

    timerEl.textContent = 'Пок. ' + gen + ' | ' + fmt(elapsed) + ' | Всего: ' + fmt(totalElapsed) + avgText;
    timerEl.style.display = gen > 0 ? 'block' : 'none';
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

    let html = '<div class="tm-gl-title">Глобальные (Пок. ' + gen + ')</div>';

    // Temperature
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">🌡</span>';
    html += '<span class="tm-gl-label">Темп</span>';
    html += '<span class="tm-gl-val">' + temp + '°C</span>';
    html += '<span class="tm-gl-left">ост. ' + tempLeft + '</span>';
    html += '</div>';

    // Oxygen
    html += '<div class="tm-gl-row">';
    html += '<span class="tm-gl-icon">O₂</span>';
    html += '<span class="tm-gl-label">Кислород</span>';
    html += '<span class="tm-gl-val">' + oxy + '%</span>';
    html += '<span class="tm-gl-left">ост. ' + oxyLeft + '</span>';
    html += '</div>';

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
        { name: 'Озеленение', cost: 23, usesSteel: true },
        { name: 'Город', cost: 25, usesSteel: true },
        { name: 'Океан', cost: 18 },
        { name: 'Температура', cost: 14 },
        { name: 'Кислород', cost: 11 },
      ];

      for (const proj of projects) {
        let effectiveCost = proj.cost;
        if (proj.usesSteel) effectiveCost = Math.max(0, proj.cost - steel * steelVal);
        const canAfford = mc >= effectiveCost;

        html += '<div class="tm-gl-sp-row' + (canAfford ? '' : ' tm-gl-sp-cant') + '">';
        html += '<span class="tm-gl-sp-name">' + proj.name + '</span>';
        html += '<span class="tm-gl-sp-cost">';
        if (proj.usesSteel && steel > 0) {
          html += effectiveCost + ' MC';
          html += ' <span class="tm-gl-sp-savings">(-' + Math.min(steel * steelVal, proj.cost) + '⚒)</span>';
        } else {
          html += proj.cost + ' MC';
        }
        html += '</span>';
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

    // 6. Awards — estimated 2-5 VP each
    let awardVP = 0;
    let awardNote = '';
    if (pv.game && pv.game.awards) {
      const fundedAwards = pv.game.awards.filter((a) => a.funded);
      if (fundedAwards.length > 0) {
        awardNote = fundedAwards.length + ' наград разыграно';
      }
    }

    // 7. City adjacency bonus (1 VP per adjacent greenery per city)
    const cityAdj = cities * 1; // rough estimate: 1 adj greenery per city on average

    // Total
    const total = tr + greeneries + cardVP + resourceVP + milestoneVP + awardVP + cityAdj;

    let html = '<div class="tm-vp-title">Оценка VP (Пок. ' + gen + ')</div>';

    // Breakdown table
    const rows = [
      { label: 'Terraform Rating', val: tr, cls: '' },
      { label: 'Озеленение', val: greeneries, cls: greeneries > 0 ? '' : 'tm-vp-zero' },
      { label: 'Города (смежность)', val: cityAdj, cls: cityAdj > 0 ? '' : 'tm-vp-zero' },
      { label: 'VP с карт', val: cardVP, cls: cardVP > 0 ? '' : 'tm-vp-zero' },
      { label: 'VP с ресурсов', val: resourceVP, cls: resourceVP > 0 ? '' : 'tm-vp-zero' },
      { label: 'Вехи', val: milestoneVP, cls: milestoneVP > 0 ? '' : 'tm-vp-zero' },
    ];

    for (const r of rows) {
      if (r.val === 0 && r.cls === 'tm-vp-zero') continue; // skip zero rows
      html += '<div class="tm-vp-row' + (r.cls ? ' ' + r.cls : '') + '">';
      html += '<span class="tm-vp-label">' + r.label + '</span>';
      html += '<span class="tm-vp-val">' + r.val + '</span>';
      html += '</div>';
    }

    html += '<div class="tm-vp-total">';
    html += '<span>Итого (оценка)</span>';
    html += '<span class="tm-vp-total-val">' + total + '</span>';
    html += '</div>';

    // Card VP details (top cards contributing VP)
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

    if (awardNote) {
      html += '<div class="tm-vp-note">' + awardNote + '</div>';
    }

    html += '<div class="tm-adv-hint">V — вкл/выкл</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
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
      ['H', 'Справка (это окно)'],
      ['1-6', 'Фильтр по тирам S/A/B/C/D/F'],
      ['Ctrl+клик', 'Сравнить две карты'],
      ['Esc', 'Закрыть панели'],
    ];

    let html = '<div class="tm-help-inner">';
    html += '<div class="tm-help-title">TM Tier Overlay v1.8 — Горячие клавиши</div>';
    for (const [key, desc] of keys) {
      html += '<div class="tm-help-row">';
      html += '<kbd class="tm-help-key">' + key + '</kbd>';
      html += '<span class="tm-help-desc">' + desc + '</span>';
      html += '</div>';
    }
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
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ enabled: enabled });
      }
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
      if (helpVisible) { helpVisible = false; if (helpEl) helpEl.style.display = 'none'; e.preventDefault(); return; }
    }

    //1..6 → toggle tier filter
    if (TIER_KEYS[e.code]) {
      e.preventDefault();
      const tier = TIER_KEYS[e.code];
      tierFilter[tier] = !tierFilter[tier];
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ tierFilter: tierFilter });
      }
      reapplyFilter();
      return;
    }
  });

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
})();
