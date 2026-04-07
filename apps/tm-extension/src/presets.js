// TM Quick Presets — runs in MAIN world (page context)
(function () {
  'use strict';

  // Official only, no Pluto (Pathfinders colonies auto-added by expansion)
  const COLONIES_NO_PLUTO = [
    'Callisto', 'Ceres', 'Enceladus', 'Europa', 'Ganymede', 'Io',
    'Luna', 'Miranda', 'Titan', 'Triton',
  ];

  const BANS_STD = ['Vitor', 'Point Luna', 'Manutech', 'Double Down'];
  const BANS_T = [...BANS_STD, 'Corridors of Power', 'High Circles', 'Rise To Power'];

  const TYPES = [
    {key: 'turmoil', label: 'Turmoil', desc: 'PV2OT + CEO + Path', turmoil: true, ceo: true, path: true, p2: true, bans: BANS_T},
    {key: 'std', label: 'Standard', desc: 'PV2O + CEO + Path', turmoil: false, ceo: true, path: true, p2: true, bans: BANS_STD},
    {key: 'classic', label: 'Classic', desc: 'PVO', turmoil: false, ceo: false, path: false, p2: false, bans: BANS_STD},
    {key: 'chill', label: 'Chill', desc: 'No bans', turmoil: false, ceo: true, path: true, p2: true, bans: []},
  ];

  const SIMPLE_FIELDS = [
    'draftVariant', 'initialDraft', 'preludeDraftVariant', 'ceosDraftVariant',
    'randomMA', 'randomFirstPlayer', 'showOtherPlayersVP', 'board',
    'solarPhaseOption', 'shuffleMapOption', 'undoOption', 'showTimers',
    'fastModeOption', 'escapeVelocityMode', 'escapeVelocityThreshold',
    'escapeVelocityBonusSeconds', 'escapeVelocityPeriod', 'escapeVelocityPenalty',
    'twoCorpsVariant', 'includeFanMA', 'startingCorporations',
    'startingPreludes', 'startingCeos', 'requiresVenusTrackCompletion',
  ];

  let selectedType = 'std';
  function presetLog() {}

  function makeSettings(type, pc) {
    return {
      playersCount: pc,
      expansions: {
        corpera: true, promo: true, venus: true, colonies: true,
        prelude: true, prelude2: type.p2, turmoil: type.turmoil,
        community: false, pathfinders: type.path, ceo: type.ceo,
        ares: false, moon: false, starwars: false, underworld: false,
      },
      draftVariant: true, initialDraft: true, preludeDraftVariant: true, ceosDraftVariant: type.ceo,
      randomMA: 'Limited synergy', randomFirstPlayer: true, showOtherPlayersVP: true,
      board: 'random all', solarPhaseOption: pc >= 4, shuffleMapOption: true,
      undoOption: true, showTimers: true, fastModeOption: true,
      escapeVelocityMode: false, escapeVelocityThreshold: 35,
      escapeVelocityBonusSeconds: 2, escapeVelocityPeriod: 2, escapeVelocityPenalty: 1,
      twoCorpsVariant: false, includeFanMA: true,
      startingCorporations: 4, startingPreludes: 4, startingCeos: 3,
      bannedCards: type.bans,
      customColonies: COLONIES_NO_PLUTO,
      requiresVenusTrackCompletion: pc >= 5,
    };
  }

  function isFormProxy(proxy) {
    return proxy && 'playersCount' in proxy && 'expansions' in proxy && 'draftVariant' in proxy;
  }

  function findCreateGameProxy() {
    const appEl = document.querySelector('#app');
    if (!appEl || !appEl.__vue_app__) return null;
    const vueApp = appEl.__vue_app__;
    let root = vueApp._instance;
    if (!root && vueApp._container && vueApp._container._vnode && vueApp._container._vnode.component) {
      root = vueApp._container._vnode.component;
    }
    if (!root) return null;
    const visited = new Set();
    return deepWalk(root, visited, 0);
  }

  function deepWalk(inst, visited, depth) {
    if (!inst || depth > 20 || visited.has(inst)) return null;
    visited.add(inst);
    if (inst.proxy && isFormProxy(inst.proxy)) return inst.proxy;
    if (inst.subTree) {
      const r = deepWalkVNode(inst.subTree, visited, depth);
      if (r) return r;
    }
    return null;
  }

  function deepWalkVNode(vnode, visited, depth) {
    if (!vnode || depth > 20) return null;
    if (vnode.component) {
      const r = deepWalk(vnode.component, visited, depth + 1);
      if (r) return r;
    }
    if (Array.isArray(vnode.children)) {
      for (const c of vnode.children) {
        if (c && typeof c === 'object') {
          const r = deepWalkVNode(c, visited, depth + 1);
          if (r) return r;
        }
      }
    }
    if (Array.isArray(vnode.dynamicChildren)) {
      for (const c of vnode.dynamicChildren) {
        if (c && typeof c === 'object') {
          const r = deepWalkVNode(c, visited, depth + 1);
          if (r) return r;
        }
      }
    }
    if (vnode.children && typeof vnode.children === 'object' && !Array.isArray(vnode.children)) {
      for (const slotFn of Object.values(vnode.children)) {
        if (typeof slotFn === 'function') {
          try {
            const slotVNodes = slotFn();
            if (Array.isArray(slotVNodes)) {
              for (const sv of slotVNodes) {
                const r = deepWalkVNode(sv, visited, depth + 1);
                if (r) return r;
              }
            }
          } catch {}
        }
      }
    }
    return null;
  }

  function findCreateGameInstance() {
    const appEl = document.querySelector('#app');
    if (!appEl || !appEl.__vue_app__) return null;
    const vueApp = appEl.__vue_app__;
    let root = vueApp._instance;
    if (!root && vueApp._container && vueApp._container._vnode && vueApp._container._vnode.component) {
      root = vueApp._container._vnode.component;
    }
    if (!root) return null;
    const visited = new Set();
    function walk(inst, depth) {
      if (!inst || depth > 20 || visited.has(inst)) return null;
      visited.add(inst);
      if (inst.proxy && isFormProxy(inst.proxy)) return inst;
      if (inst.subTree) {
        const r = walkVN(inst.subTree, depth);
        if (r) return r;
      }
      return null;
    }
    function walkVN(vn, depth) {
      if (!vn || depth > 20) return null;
      if (vn.component) { const r = walk(vn.component, depth + 1); if (r) return r; }
      if (Array.isArray(vn.children)) { for (const c of vn.children) { if (c && typeof c === 'object') { const r = walkVN(c, depth + 1); if (r) return r; } } }
      if (Array.isArray(vn.dynamicChildren)) { for (const c of vn.dynamicChildren) { if (c && typeof c === 'object') { const r = walkVN(c, depth + 1); if (r) return r; } } }
      return null;
    }
    return walk(root, 0);
  }

  function applySettings(s) {
    const p = findCreateGameProxy();
    if (!p) {
      alert('Form not found. Refresh the page.');
      return;
    }
    const scrollY = window.scrollY;

    p.playersCount = s.playersCount || 3;
    if (s.expansions) {
      for (const [key, val] of Object.entries(s.expansions)) {
        if (p.expansions && key in p.expansions) p.expansions[key] = val;
      }
    }
    for (const f of SIMPLE_FIELDS) {
      if (s[f] !== undefined && f in p) p[f] = s[f];
    }
    if (s.customColonies) p.customColonies = [...s.customColonies];
    const hasBans = s.bannedCards && s.bannedCards.length > 0;
    if (hasBans) p.bannedCards = [...s.bannedCards];
    requestAnimationFrame(() => {
      if ('showBannedCards' in p) p.showBannedCards = hasBans;
      if ('showColoniesList' in p) p.showColoniesList = false;
      if ('showCorporationList' in p) p.showCorporationList = false;
      if ('showPreludesList' in p) p.showPreludesList = false;
      if ('showIncludedCards' in p) p.showIncludedCards = false;
      // Apply bans to cardsFilter ref after DOM renders
      if (hasBans) {
        requestAnimationFrame(() => {
          try {
            const inst = findCreateGameInstance();
            if (inst && inst.refs && inst.refs.cardsFilter) {
              inst.refs.cardsFilter.selected = [...s.bannedCards];
            }
          } catch(e) {}
        });
      }
      window.scrollTo(0, scrollY);
    });
  }

  function toggleField(field) {
    const p = findCreateGameProxy();
    if (!p) return;
    p[field] = !p[field];
    updateToggles(p);
  }

  function cycleEV() {
    const p = findCreateGameProxy();
    if (!p) return;
    if (!p.escapeVelocityMode) {
      p.escapeVelocityMode = true;
      p.escapeVelocityThreshold = 35;
    } else if (p.escapeVelocityThreshold === 35) {
      p.escapeVelocityThreshold = 30;
    } else if (p.escapeVelocityThreshold === 30) {
      p.escapeVelocityThreshold = 40;
    } else {
      p.escapeVelocityMode = false;
    }
    updateToggles(p);
  }

  function updateToggles(p) {
    if (!p) p = findCreateGameProxy();
    if (!p) return;
    document.querySelectorAll('.tm-toggle-merger').forEach((b) => b.classList.toggle('active', p.twoCorpsVariant));
    document.querySelectorAll('.tm-toggle-community').forEach((b) => b.classList.toggle('active', p.expansions.community));
    const evBtn = document.querySelector('.tm-toggle-ev');
    if (evBtn) {
      evBtn.classList.toggle('active', p.escapeVelocityMode);
      evBtn.textContent = p.escapeVelocityMode ? 'EV ' + p.escapeVelocityThreshold : 'EV';
    }
  }

  function updateTypeButtons() {
    document.querySelectorAll('.tm-type-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.key === selectedType);
    });
  }

  function injectButtons() {
    const createGame = document.querySelector('#create-game');
    if (!createGame || document.querySelector('.tm-presets-bar')) return !!document.querySelector('.tm-presets-bar');
    const formPanel = createGame.querySelector('.create-game-form');
    if (!formPanel) return false;

    const bar = document.createElement('div');
    bar.className = 'tm-presets-bar';

    // Row 1: types
    const row1 = document.createElement('div');
    row1.className = 'tm-presets-row';
    for (const type of TYPES) {
      const btn = document.createElement('button');
      btn.className = 'tm-preset-btn tm-type-btn' + (type.key === selectedType ? ' active' : '');
      btn.textContent = type.label;
      btn.title = type.desc;
      btn.dataset.key = type.key;
      btn.addEventListener('click', () => {
        selectedType = type.key;
        updateTypeButtons();
        // Apply immediately with current player count
        const p = findCreateGameProxy();
        presetLog('[TM-Presets] type click:', type.key, 'proxy:', !!p, 'playersCount:', p && p.playersCount);
        if (p) applySettings(makeSettings(type, p.playersCount || 3));
      });
      row1.appendChild(btn);
    }
    bar.appendChild(row1);

    // Row 2: player count + toggles
    const row2 = document.createElement('div');
    row2.className = 'tm-presets-row';
    for (const n of [3, 4, 5]) {
      const btn = document.createElement('button');
      btn.className = 'tm-preset-btn tm-preset-btn-sm';
      btn.textContent = n + 'P';
      btn.addEventListener('click', () => {
        const type = TYPES.find((t) => t.key === selectedType);
        if (type) applySettings(makeSettings(type, n));
      });
      row2.appendChild(btn);
    }

    // Separator
    const sep = document.createElement('span');
    sep.className = 'tm-presets-sep';
    row2.appendChild(sep);

    // Merger toggle
    const mergerBtn = document.createElement('button');
    mergerBtn.className = 'tm-preset-btn tm-preset-btn-toggle tm-toggle-merger';
    mergerBtn.textContent = 'Merger';
    mergerBtn.addEventListener('click', () => toggleField('twoCorpsVariant'));
    row2.appendChild(mergerBtn);

    // EV toggle
    const evBtn = document.createElement('button');
    evBtn.className = 'tm-preset-btn tm-preset-btn-toggle tm-toggle-ev';
    evBtn.textContent = 'EV';
    evBtn.addEventListener('click', cycleEV);
    row2.appendChild(evBtn);

    // Community toggle
    const comBtn = document.createElement('button');
    comBtn.className = 'tm-preset-btn tm-preset-btn-toggle tm-toggle-community';
    comBtn.textContent = 'Community';
    comBtn.addEventListener('click', () => {
      const p = findCreateGameProxy();
      if (p) { p.expansions.community = !p.expansions.community; updateToggles(p); }
    });
    row2.appendChild(comBtn);

    bar.appendChild(row2);
    formPanel.parentNode.insertBefore(bar, formPanel);

    // Hide original site presets to avoid duplication
    // The site's preset bar is a sibling with preset-like buttons but without our class
    var siblings = formPanel.parentNode.children;
    for (var si = 0; si < siblings.length; si++) {
      var sib = siblings[si];
      if (sib === bar || sib === formPanel) continue;
      // Original site preset bar: contains buttons with text like "Turmoil", "Standard", etc.
      var btns = sib.querySelectorAll ? sib.querySelectorAll('button, .btn') : [];
      if (btns.length >= 3) {
        var hasPresetText = false;
        for (var bi = 0; bi < btns.length; bi++) {
          var txt = (btns[bi].textContent || '').trim();
          if (txt === 'Standard' || txt === 'Turmoil' || txt === 'Classic' || txt === 'Chill') {
            hasPresetText = true; break;
          }
        }
        if (hasPresetText && !sib.classList.contains('tm-presets-bar')) {
          sib.style.display = 'none';
        }
      }
    }

    return true;
  }

  function waitAndInject() {
    if (injectButtons()) return;
    const observer = new MutationObserver(() => {
      if (injectButtons()) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndInject);
  } else {
    waitAndInject();
  }
})();
