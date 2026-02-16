// TM Tier Overlay — Game Creation Templates
// Adds template buttons to the create game form

(function () {
  'use strict';

  // Default templates
  const BUILT_IN_TEMPLATES = {
    'Стандарт 3И': {
      playersCount: 3,
      expansions: {
        corpera: true, prelude: true, prelude2: true,
        venus: true, colonies: true, turmoil: true, promo: true,
        ares: false, community: false, moon: false, pathfinders: false,
        ceo: false, starwars: false, underworld: false,
      },
      board: 'tharsis',
      solarPhaseOption: true,  // WGT
      draftVariant: true,
      initialDraft: false,
      randomFirstPlayer: true,
      showOtherPlayersVP: false,
      undoOption: false,
      showTimers: true,
      fastModeOption: false,
      startingCorporations: 2,
      startingPreludes: 4,
      shuffleMapOption: false,
      twoCorpsVariant: false,
    },
    'Полная 3И': {
      playersCount: 3,
      expansions: {
        corpera: true, prelude: true, prelude2: true,
        venus: true, colonies: true, turmoil: true, promo: true,
        ares: false, community: false, moon: true, pathfinders: true,
        ceo: true, starwars: false, underworld: false,
      },
      board: 'tharsis',
      solarPhaseOption: true,
      draftVariant: true,
      initialDraft: false,
      randomFirstPlayer: true,
      showOtherPlayersVP: false,
      undoOption: false,
      showTimers: true,
      fastModeOption: false,
      startingCorporations: 2,
      startingPreludes: 4,
      startingCeos: 3,
      shuffleMapOption: false,
      twoCorpsVariant: false,
    },
    'Быстрое соло': {
      playersCount: 1,
      expansions: {
        corpera: true, prelude: true, prelude2: true,
        venus: true, colonies: true, turmoil: true, promo: true,
        ares: false, community: false, moon: false, pathfinders: false,
        ceo: false, starwars: false, underworld: false,
      },
      board: 'tharsis',
      solarPhaseOption: false,
      draftVariant: false,
      initialDraft: false,
      undoOption: true,
      showTimers: false,
      fastModeOption: false,
      startingCorporations: 2,
      startingPreludes: 4,
      shuffleMapOption: false,
    },
  };

  let userTemplates = {};

  // Load user templates
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ gameTemplates: {} }, (s) => {
      userTemplates = s.gameTemplates;
    });
  }

  // ── Form field mapping ──
  // Maps template keys to form element IDs/selectors

  const CHECKBOX_MAP = {
    solarPhaseOption: '#WGT-checkbox',
    draftVariant: '#draft-checkbox',
    initialDraft: '#initialDraft-checkbox',
    randomFirstPlayer: '#randomFirstPlayer-checkbox',
    showOtherPlayersVP: '#realTimeVP-checkbox',
    undoOption: '#undo-checkbox',
    showTimers: '#timer-checkbox',
    fastModeOption: '#fastMode-checkbox',
    shuffleMapOption: '#shuffleMap-checkbox',
    twoCorpsVariant: '#twoCorps-checkbox',
  };

  const EXPANSION_MAP = {
    corpera: '#corporateEra-checkbox',
    prelude: '#prelude-checkbox',
    prelude2: '#prelude2-checkbox',
    venus: '#venusNext-checkbox',
    colonies: '#colonies-checkbox',
    turmoil: '#turmoil-checkbox',
    promo: '#promo-checkbox',
    ares: '#ares-checkbox',
    community: '#communityCards-checkbox',
    moon: '#themoon-checkbox',
    pathfinders: '#pathfinders-checkbox',
    ceo: '#ceo-checkbox',
    starwars: '#starwars-checkbox',
    underworld: '#underworld-checkbox',
  };

  /**
   * Set a checkbox value via Vue reactivity
   */
  function setCheckbox(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (el.checked !== value) {
      el.click();
    }
  }

  /**
   * Set a radio button value
   */
  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el && !el.checked) {
      el.click();
    }
  }

  /**
   * Set a number input value
   */
  function setNumber(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Apply a template to the create game form
   */
  function applyTemplate(template) {
    const form = document.querySelector('#create-game');
    if (!form) return;

    // Players count
    if (template.playersCount) {
      setRadio('playersCount', template.playersCount);
    }

    // Wait for Vue to react to player count change
    setTimeout(() => {
      // Expansions
      if (template.expansions) {
        for (const [key, selector] of Object.entries(EXPANSION_MAP)) {
          if (template.expansions[key] !== undefined) {
            setCheckbox(selector, template.expansions[key]);
          }
        }
      }

      // Board
      if (template.board) {
        setRadio('board', template.board);
      }

      // Wait for expansions to render sub-options
      setTimeout(() => {
        // Checkboxes
        for (const [key, selector] of Object.entries(CHECKBOX_MAP)) {
          if (template[key] !== undefined) {
            setCheckbox(selector, template[key]);
          }
        }

        // Number inputs
        if (template.startingCorporations) {
          setNumber('#startingCorpNum-checkbox', template.startingCorporations);
        }
        if (template.startingPreludes) {
          setNumber('#startingPreludeNum-checkbox', template.startingPreludes);
        }
        if (template.startingCeos) {
          setNumber('#startingCEONum-checkbox', template.startingCeos);
        }

        showNotification('Шаблон применён!');
      }, 200);
    }, 200);
  }

  /**
   * Read current form state into a template object
   */
  function readFormState() {
    const template = {};

    // Player count
    const checkedRadio = document.querySelector('input[name="playersCount"]:checked');
    if (checkedRadio) template.playersCount = parseInt(checkedRadio.value);

    // Expansions
    template.expansions = {};
    for (const [key, selector] of Object.entries(EXPANSION_MAP)) {
      const el = document.querySelector(selector);
      if (el) template.expansions[key] = el.checked;
    }

    // Board
    const boardRadio = document.querySelector('input[name="board"]:checked');
    if (boardRadio) template.board = boardRadio.value;

    // Checkboxes
    for (const [key, selector] of Object.entries(CHECKBOX_MAP)) {
      const el = document.querySelector(selector);
      if (el) template[key] = el.checked;
    }

    // Numbers
    const corpNum = document.querySelector('#startingCorpNum-checkbox');
    if (corpNum) template.startingCorporations = parseInt(corpNum.value);
    const prelNum = document.querySelector('#startingPreludeNum-checkbox');
    if (prelNum) template.startingPreludes = parseInt(prelNum.value);
    const ceoNum = document.querySelector('#startingCEONum-checkbox');
    if (ceoNum) template.startingCeos = parseInt(ceoNum.value);

    return template;
  }

  /**
   * Show a brief notification
   */
  function showNotification(text) {
    let n = document.querySelector('.tm-notify');
    if (!n) {
      n = document.createElement('div');
      n.className = 'tm-notify';
      document.body.appendChild(n);
    }
    n.textContent = text;
    n.style.display = 'block';
    setTimeout(() => { n.style.display = 'none'; }, 2000);
  }

  /**
   * Build the template panel UI
   */
  function buildTemplatePanel() {
    const form = document.querySelector('#create-game');
    if (!form || form.querySelector('.tm-templates')) return;

    const panel = document.createElement('div');
    panel.className = 'tm-templates';

    const title = document.createElement('div');
    title.className = 'tm-templates-title';
    title.textContent = 'Шаблоны игры';
    panel.appendChild(title);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'tm-templates-btns';

    // Built-in templates
    const allTemplates = { ...BUILT_IN_TEMPLATES, ...userTemplates };
    for (const [name, template] of Object.entries(allTemplates)) {
      const btn = document.createElement('button');
      btn.className = 'tm-template-btn';
      btn.textContent = name;
      btn.title = describeTemplate(template);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        applyTemplate(template);
      });
      btnContainer.appendChild(btn);
    }

    panel.appendChild(btnContainer);

    // Save current as template
    const actions = document.createElement('div');
    actions.className = 'tm-templates-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'tm-template-save';
    saveBtn.textContent = '+ Сохранить текущий';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const name = prompt('Название шаблона:');
      if (!name) return;
      const state = readFormState();
      userTemplates[name] = state;
      chrome.storage.local.set({ gameTemplates: userTemplates }, () => {
        showNotification('Шаблон «' + name + '» сохранён!');
        // Rebuild panel to show new template
        panel.remove();
        buildTemplatePanel();
      });
    });
    actions.appendChild(saveBtn);

    if (Object.keys(userTemplates).length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'tm-template-clear';
      clearBtn.textContent = 'Очистить свои';
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm('Удалить все пользовательские шаблоны?')) return;
        userTemplates = {};
        chrome.storage.local.set({ gameTemplates: {} }, () => {
          showNotification('Шаблоны очищены');
          panel.remove();
          buildTemplatePanel();
        });
      });
      actions.appendChild(clearBtn);
    }

    panel.appendChild(actions);

    // Insert at top of form
    const formContent = form.querySelector('.create-game-form');
    if (formContent) {
      formContent.parentNode.insertBefore(panel, formContent);
    } else {
      form.insertBefore(panel, form.firstChild.nextSibling);
    }
  }

  /**
   * Short description of a template for tooltip
   */
  function describeTemplate(t) {
    const parts = [];
    if (t.playersCount) parts.push(t.playersCount + 'P');
    if (t.board) parts.push(t.board);
    if (t.solarPhaseOption) parts.push('WGT');
    if (t.draftVariant) parts.push('Драфт');
    const exps = [];
    if (t.expansions) {
      if (t.expansions.prelude) exps.push('Прел');
      if (t.expansions.venus) exps.push('Вен');
      if (t.expansions.colonies) exps.push('Кол');
      if (t.expansions.turmoil) exps.push('Тур');
      if (t.expansions.moon) exps.push('Луна');
      if (t.expansions.pathfinders) exps.push('Путь');
      if (t.expansions.ceo) exps.push('CEO');
    }
    if (exps.length) parts.push(exps.join('+'));
    return parts.join(' | ');
  }

  // ── Observer: inject panel when create game form appears ──

  const observer = new MutationObserver(() => {
    if (document.querySelector('#create-game') && !document.querySelector('.tm-templates')) {
      buildTemplatePanel();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  if (document.querySelector('#create-game')) {
    buildTemplatePanel();
  }
})();
