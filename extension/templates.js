// TM Tier Overlay — Game Creation Templates
// Adds template buttons to the create game form

(function () {
  'use strict';

  // No built-in templates — user creates their own
  const BUILT_IN_TEMPLATES = {};

  let userTemplates = {};
  let templateOrder = []; // ordered template names for hotkeys + drag-and-drop

  // Load user templates + order
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ gameTemplates: {}, templateOrder: [] }, (s) => {
      userTemplates = s.gameTemplates;
      templateOrder = s.templateOrder || [];
      syncOrder();
    });
  }

  /** Keep templateOrder in sync with actual template names */
  function syncOrder() {
    const names = Object.keys(userTemplates);
    // Remove stale entries
    templateOrder = templateOrder.filter((n) => names.includes(n));
    // Append new entries not yet in order
    for (const n of names) {
      if (!templateOrder.includes(n)) templateOrder.push(n);
    }
  }

  /** Get templates in display order (last-game first, then ordered user templates) */
  function getOrderedTemplates() {
    syncOrder();
    const result = [];
    // _lastGame always first
    if (userTemplates._lastGame) {
      result.push(['_lastGame', userTemplates._lastGame]);
    }
    for (const name of templateOrder) {
      if (name === '_lastGame') continue;
      if (userTemplates[name]) result.push([name, userTemplates[name]]);
    }
    return result;
  }

  // ── Form field mapping ──

  const CHECKBOX_MAP = {
    // Core options
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
    // Venus
    altVenusBoard: '#altVenusBoard-checkbox',
    // Solo
    soloTR: '#soloTR-checkbox',
    // Escape Velocity
    escapeVelocityMode: '#escapevelocity-checkbox',
    // Milestones/Awards
    randomMA: '#randomMA-checkbox',
    modularMA: '#modularMA-checkbox',
    includeFanMA: '#fanMA-checkbox',
    // Venus/Moon track completion
    requiresVenusTrackCompletion: '#requiresVenusTrackCompletion-checkbox',
    requiresMoonTrackCompletion: '#requiresMoonTrackCompletion-checkbox',
    // Moon standard project variants
    moonStandardProjectVariant: '#moonStandardProjectVariant2-checkbox',
    moonStandardProjectVariant1: '#moonStandardProjectVariant1-checkbox',
    // Turmoil
    politicalAgendasExtension: '#politicalAgendas-checkbox',
    // Ares
    aresExtremeVariant: '#aresExtremeVariantVariant-checkbox',
    // Draft variants
    preludeDraftVariant: '#preludeDraft-checkbox',
    ceosDraftVariant: '#ceosDraft-checkbox',
    // Seeded game
    seededGame: '#seeded-checkbox',
    // Negative global events
    removeNegativeGlobalEventsOption: '#removeNegativeEvent-checkbox',
    // Ban/Include/Custom lists toggles
    showBannedCards: '#bannedCards-checkbox',
    showIncludedCards: '#includedCards-checkbox',
    showColoniesList: '#customColonies-checkbox',
  };

  const NUMBER_MAP = {
    startingCorporations: '#startingCorpNum-checkbox',
    startingPreludes: '#startingPreludeNum-checkbox',
    startingCeos: '#startingCEONum-checkbox',
    escapeVelocityThreshold: '#escapeThreshold-checkbox',
    escapeVelocityBonusSeconds: '#escapeBonusSeconds-checkbox',
    escapeVelocityPeriod: '#escapePeriod-checkbox',
  };

  const RADIO_MAP = {
    randomMAStyle: {
      name: 'randomMA',
      values: ['limitedRandomMA', 'unlimitedRandomMA'],
    },
    politicalAgendasStyle: {
      name: 'politicalAgendasExtension',
      values: ['randomAgendaStyle', 'chairmanAgendaStyle'],
    },
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

  // ── Helpers ──

  function setCheckbox(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (el.checked !== value) el.click();
  }

  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el && !el.checked) el.click();
  }

  function setNumber(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setTextInput(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Read banned/included cards from CardsFilter DOM ──

  function readCardsList(containerIndex) {
    // There can be two CardsFilter instances: banned (first) and included (second)
    const containers = document.querySelectorAll('.cards-filter-results-cont');
    if (!containers[containerIndex]) return [];
    const labels = containers[containerIndex].querySelectorAll('.cards-filter-result label');
    return Array.from(labels).map((l) => l.textContent.trim()).filter(Boolean);
  }

  // ── Read custom colonies selection ──

  function readSelectedColonies() {
    const checkboxes = document.querySelectorAll('.colonies-filter input[type="checkbox"]');
    if (!checkboxes.length) return [];
    const selected = [];
    checkboxes.forEach((cb) => {
      if (cb.checked && cb.value) selected.push(cb.value);
    });
    return selected;
  }

  // ── Apply template (5 cascading phases) ──

  function applyTemplate(template) {
    const form = document.querySelector('#create-game');
    if (!form) return;

    // Phase 1 (0ms): Players count
    if (template.playersCount) {
      setRadio('playersCount', template.playersCount);
    }

    // Phase 2 (200ms): Expansions + board
    setTimeout(() => {
      if (template.expansions) {
        for (const [key, selector] of Object.entries(EXPANSION_MAP)) {
          if (template.expansions[key] !== undefined) {
            setCheckbox(selector, template.expansions[key]);
          }
        }
      }
      if (template.board) {
        setRadio('board', template.board);
      }
    }, 200);

    // Phase 3 (400ms): Main checkboxes (including toggles that reveal sub-options)
    setTimeout(() => {
      for (const [key, selector] of Object.entries(CHECKBOX_MAP)) {
        if (template[key] !== undefined) {
          setCheckbox(selector, template[key]);
        }
      }
    }, 400);

    // Phase 4 (600ms): Sub-options (radios, numbers, seed, banned/included cards, colonies)
    setTimeout(() => {
      // Radio styles
      for (const [key, config] of Object.entries(RADIO_MAP)) {
        if (template[key] !== undefined) {
          if (config.values.includes(template[key])) {
            setRadio(config.name, template[key]);
          }
        }
      }

      // Number inputs
      for (const [key, selector] of Object.entries(NUMBER_MAP)) {
        if (template[key] !== undefined) {
          setNumber(selector, template[key]);
        }
      }

      // Seed (cloned game ID)
      if (template.clonedGameId) {
        setTextInput('input[name="clonedGamedId"]', template.clonedGameId);
      }
    }, 600);

    // Phase 5 (900ms): Complex sub-components (banned cards, colonies) + notification
    setTimeout(() => {
      // Banned cards — type into filter input with comma-separated names
      if (template.bannedCards && template.bannedCards.length) {
        applyCardsList(0, template.bannedCards);
      }
      // Included cards
      if (template.includedCards && template.includedCards.length) {
        applyCardsList(1, template.includedCards);
      }
      // Custom colonies
      if (template.customColonies && template.customColonies.length) {
        applyColonies(template.customColonies);
      }

      showNotification('Шаблон применён!');
    }, 900);
  }

  /** Apply a list of card names to a CardsFilter instance (by typing comma-separated) */
  function applyCardsList(filterIndex, cardNames) {
    const filters = document.querySelectorAll('.cards-filter');
    const filter = filters[filterIndex];
    if (!filter) return;
    const input = filter.querySelector('.form-input');
    if (!input) return;
    // Type all names comma-separated — CardsFilter supports this
    setTextInput('.cards-filter:nth-of-type(' + (filterIndex + 1) + ') .form-input', cardNames.join(', '));
  }

  /** Apply colony selection by toggling checkboxes */
  function applyColonies(colonyNames) {
    const checkboxes = document.querySelectorAll('.colonies-filter input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      const shouldBeChecked = colonyNames.includes(cb.value);
      if (cb.checked !== shouldBeChecked) cb.click();
    });
  }

  // ── Read form state ──

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

    // All checkboxes
    for (const [key, selector] of Object.entries(CHECKBOX_MAP)) {
      const el = document.querySelector(selector);
      if (el) template[key] = el.checked;
    }

    // All number inputs
    for (const [key, selector] of Object.entries(NUMBER_MAP)) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) template[key] = parseInt(el.value) || 0;
    }

    // Radio groups
    for (const [key, config] of Object.entries(RADIO_MAP)) {
      const checked = document.querySelector(`input[name="${config.name}"]:checked`);
      if (checked && config.values.includes(checked.value)) {
        template[key] = checked.value;
      }
    }

    // Seed (cloned game ID)
    const seedInput = document.querySelector('input[name="clonedGamedId"]');
    if (seedInput && seedInput.value) {
      template.clonedGameId = seedInput.value;
    }

    // Banned cards
    const bannedCards = readCardsList(0);
    if (bannedCards.length) template.bannedCards = bannedCards;

    // Included cards
    const includedCards = readCardsList(1);
    if (includedCards.length) template.includedCards = includedCards;

    // Custom colonies
    const colonies = readSelectedColonies();
    if (colonies.length) template.customColonies = colonies;

    return template;
  }

  // ── Notifications ──

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

  // ── Storage ──

  function saveTemplates(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      syncOrder();
      chrome.storage.local.set(
        { gameTemplates: userTemplates, templateOrder: templateOrder },
        callback
      );
    }
  }

  // ── Visual diff: highlight fields that will change ──

  function showDiff(template) {
    clearDiff();
    const form = document.querySelector('#create-game');
    if (!form) return;

    // Checkboxes
    for (const [key, selector] of Object.entries(CHECKBOX_MAP)) {
      if (template[key] === undefined) continue;
      const el = document.querySelector(selector);
      if (!el) continue;
      if (el.checked !== template[key]) {
        const label = el.closest('label') || el.parentElement;
        label.classList.add(template[key] ? 'tm-diff-on' : 'tm-diff-off');
      }
    }

    // Expansions
    if (template.expansions) {
      for (const [key, selector] of Object.entries(EXPANSION_MAP)) {
        if (template.expansions[key] === undefined) continue;
        const el = document.querySelector(selector);
        if (!el) continue;
        if (el.checked !== template.expansions[key]) {
          const label = el.closest('label') || el.parentElement;
          label.classList.add(template.expansions[key] ? 'tm-diff-on' : 'tm-diff-off');
        }
      }
    }

    // Player count
    if (template.playersCount) {
      const cur = document.querySelector('input[name="playersCount"]:checked');
      if (cur && parseInt(cur.value) !== template.playersCount) {
        const target = document.querySelector(`input[name="playersCount"][value="${template.playersCount}"]`);
        if (target) {
          const label = target.closest('label') || target.parentElement;
          label.classList.add('tm-diff-on');
        }
      }
    }

    // Board
    if (template.board) {
      const cur = document.querySelector('input[name="board"]:checked');
      if (cur && cur.value !== template.board) {
        const target = document.querySelector(`input[name="board"][value="${template.board}"]`);
        if (target) {
          const label = target.closest('label') || target.parentElement;
          label.classList.add('tm-diff-on');
        }
      }
    }
  }

  function clearDiff() {
    document.querySelectorAll('.tm-diff-on, .tm-diff-off').forEach((el) => {
      el.classList.remove('tm-diff-on', 'tm-diff-off');
    });
  }

  // ── Export / Import ──

  function exportTemplates() {
    const data = { templates: userTemplates, order: templateOrder };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tm-templates.json';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Экспорт завершён');
  }

  function importTemplates() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const imported = data.templates || data;
          let count = 0;
          for (const [name, tpl] of Object.entries(imported)) {
            if (name === '_lastGame') continue; // don't import auto-saves
            if (typeof tpl !== 'object') continue;
            if (userTemplates[name]) {
              if (!confirm('Перезаписать «' + name + '»?')) continue;
            }
            userTemplates[name] = tpl;
            count++;
          }
          if (data.order && Array.isArray(data.order)) {
            // Merge order: imported order items go to end if not already present
            for (const n of data.order) {
              if (!templateOrder.includes(n) && userTemplates[n]) {
                templateOrder.push(n);
              }
            }
          }
          saveTemplates(() => {
            showNotification('Импортировано: ' + count + ' шаблонов');
            rebuildPanel();
          });
        } catch (e) {
          alert('Ошибка разбора JSON: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ── Last Game auto-save ──

  function setupLastGameCapture() {
    // Watch for Create Game button click
    const observer = new MutationObserver(() => {
      const btn = document.querySelector('.create-game-action .btn');
      if (!btn || btn.dataset.tmHooked) return;
      btn.dataset.tmHooked = 'true';
      btn.addEventListener('click', () => {
        const state = readFormState();
        userTemplates._lastGame = state;
        saveTemplates(() => {});
      }, true); // capture phase — fires before Vue handler
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Hotkeys: Ctrl+1..9 ──

  function setupHotkeys() {
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const num = parseInt(e.key);
      if (isNaN(num) || num < 1 || num > 9) return;
      if (!document.querySelector('#create-game')) return;

      const ordered = getOrderedTemplates().filter(([n]) => n !== '_lastGame');
      const idx = num - 1;
      if (idx >= ordered.length) return;

      e.preventDefault();
      applyTemplate(ordered[idx][1]);
      showNotification('Ctrl+' + num + ' → «' + ordered[idx][0] + '»');
    });
  }

  // ── Drag and Drop reordering ──

  let dragSrcName = null;

  function makeDraggable(wrapper, name) {
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', (e) => {
      dragSrcName = name;
      wrapper.classList.add('tm-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    wrapper.addEventListener('dragend', () => {
      wrapper.classList.remove('tm-dragging');
      document.querySelectorAll('.tm-drag-over').forEach((el) => el.classList.remove('tm-drag-over'));
      dragSrcName = null;
    });
    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      wrapper.classList.add('tm-drag-over');
    });
    wrapper.addEventListener('dragleave', () => {
      wrapper.classList.remove('tm-drag-over');
    });
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('tm-drag-over');
      if (!dragSrcName || dragSrcName === name) return;
      // Reorder
      const srcIdx = templateOrder.indexOf(dragSrcName);
      const dstIdx = templateOrder.indexOf(name);
      if (srcIdx === -1 || dstIdx === -1) return;
      templateOrder.splice(srcIdx, 1);
      templateOrder.splice(dstIdx, 0, dragSrcName);
      saveTemplates(() => rebuildPanel());
    });
  }

  // ── Panel rebuild helper ──

  function rebuildPanel() {
    const panel = document.querySelector('.tm-templates');
    if (panel) panel.remove();
    buildTemplatePanel();
  }

  // ── Build template panel UI ──

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

    const ordered = getOrderedTemplates();
    let hotkeyIdx = 0;

    for (const [name, template] of ordered) {
      const isLastGame = name === '_lastGame';
      const isUser = name in userTemplates;

      const wrapper = document.createElement('div');
      wrapper.className = 'tm-template-wrapper';
      if (isLastGame) wrapper.classList.add('tm-template-lastgame');

      const btn = document.createElement('button');
      btn.className = 'tm-template-btn';
      if (isLastGame) btn.classList.add('tm-btn-lastgame');

      const displayName = isLastGame ? 'Последняя игра' : name;
      const hotkeyNum = isLastGame ? null : (hotkeyIdx < 9 ? hotkeyIdx + 1 : null);
      if (!isLastGame) hotkeyIdx++;

      btn.textContent = displayName;

      // Tooltip
      const tooltipParts = [describeTemplate(template)];
      if (hotkeyNum) tooltipParts.push('Ctrl+' + hotkeyNum);
      if (isUser && !isLastGame) tooltipParts.push('ПКМ — переименовать | Drag — перетащить');
      btn.title = tooltipParts.join('\n');

      // Click → apply
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        applyTemplate(template);
      });

      // Hover → visual diff
      btn.addEventListener('mouseenter', () => showDiff(template));
      btn.addEventListener('mouseleave', () => clearDiff());

      wrapper.appendChild(btn);

      if (isUser && !isLastGame) {
        // Duplicate button
        const dupBtn = document.createElement('span');
        dupBtn.className = 'tm-template-dup';
        dupBtn.textContent = '\u29C9'; // ⧉ copy icon
        dupBtn.title = 'Дублировать';
        dupBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          let copyName = 'Копия ' + name;
          let i = 2;
          while (userTemplates[copyName]) { copyName = 'Копия ' + name + ' ' + i; i++; }
          userTemplates[copyName] = JSON.parse(JSON.stringify(template));
          saveTemplates(() => {
            showNotification('Создана копия «' + copyName + '»');
            rebuildPanel();
          });
        });
        wrapper.appendChild(dupBtn);

        // Delete button
        const delBtn = document.createElement('span');
        delBtn.className = 'tm-template-del';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Удалить';
        delBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm('Удалить шаблон «' + name + '»?')) return;
          delete userTemplates[name];
          saveTemplates(() => {
            showNotification('Шаблон «' + name + '» удалён');
            rebuildPanel();
          });
        });
        wrapper.appendChild(delBtn);

        // Right-click → rename
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const newName = prompt('Новое название:', name);
          if (!newName || newName === name) return;
          if (newName === '_lastGame') { alert('Это имя зарезервировано'); return; }
          if (userTemplates[newName]) {
            alert('Шаблон «' + newName + '» уже существует');
            return;
          }
          const idx = templateOrder.indexOf(name);
          userTemplates[newName] = userTemplates[name];
          delete userTemplates[name];
          if (idx !== -1) templateOrder[idx] = newName;
          saveTemplates(() => {
            showNotification('Переименован → «' + newName + '»');
            rebuildPanel();
          });
        });

        // Drag-and-drop reordering
        makeDraggable(wrapper, name);

      } else if (isLastGame) {
        // Delete _lastGame
        const delBtn = document.createElement('span');
        delBtn.className = 'tm-template-del';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Удалить';
        delBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          delete userTemplates._lastGame;
          saveTemplates(() => rebuildPanel());
        });
        wrapper.appendChild(delBtn);
      }

      btnContainer.appendChild(wrapper);
    }

    panel.appendChild(btnContainer);

    // ── Actions row ──
    const actions = document.createElement('div');
    actions.className = 'tm-templates-actions';

    // Save
    const saveBtn = document.createElement('button');
    saveBtn.className = 'tm-template-save';
    saveBtn.textContent = '+ Сохранить';
    saveBtn.title = 'Сохранить текущие настройки как шаблон';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const name = prompt('Название шаблона:');
      if (!name) return;
      if (name === '_lastGame') { alert('Это имя зарезервировано'); return; }
      // Overwrite protection
      if (userTemplates[name]) {
        if (!confirm('Перезаписать шаблон «' + name + '»?')) return;
      }
      userTemplates[name] = readFormState();
      saveTemplates(() => {
        showNotification('Шаблон «' + name + '» сохранён!');
        rebuildPanel();
      });
    });
    actions.appendChild(saveBtn);

    // Export
    const expBtn = document.createElement('button');
    expBtn.className = 'tm-template-action-btn';
    expBtn.textContent = 'Экспорт';
    expBtn.title = 'Скачать все шаблоны как JSON файл';
    expBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportTemplates();
    });
    actions.appendChild(expBtn);

    // Import
    const impBtn = document.createElement('button');
    impBtn.className = 'tm-template-action-btn';
    impBtn.textContent = 'Импорт';
    impBtn.title = 'Загрузить шаблоны из JSON файла';
    impBtn.addEventListener('click', (e) => {
      e.preventDefault();
      importTemplates();
    });
    actions.appendChild(impBtn);

    panel.appendChild(actions);

    // Insert at top of form
    const formContent = form.querySelector('.create-game-form');
    if (formContent) {
      formContent.parentNode.insertBefore(panel, formContent);
    } else {
      form.insertBefore(panel, form.firstChild.nextSibling);
    }
  }

  // ── Describe template for tooltip ──

  function describeTemplate(t) {
    const parts = [];
    if (t.playersCount) parts.push(t.playersCount + 'P');
    if (t.board) parts.push(t.board);
    if (t.solarPhaseOption) parts.push('WGT');
    if (t.draftVariant) parts.push('Драфт');
    if (t.soloTR) parts.push('Solo TR');

    const exps = [];
    if (t.expansions) {
      if (t.expansions.prelude) exps.push('Прел');
      if (t.expansions.venus) exps.push('Вен');
      if (t.expansions.colonies) exps.push('Кол');
      if (t.expansions.turmoil) exps.push('Тур');
      if (t.expansions.moon) exps.push('Луна');
      if (t.expansions.pathfinders) exps.push('Путь');
      if (t.expansions.ceo) exps.push('CEO');
      if (t.expansions.underworld) exps.push('UW');
    }
    if (exps.length) parts.push(exps.join('+'));

    if (t.altVenusBoard) parts.push('AltVenus');
    if (t.randomMA) parts.push('RandMA');
    if (t.escapeVelocityMode) parts.push('EscVel');
    if (t.preludeDraftVariant) parts.push('ПрелДрафт');
    if (t.bannedCards && t.bannedCards.length) parts.push('Ban:' + t.bannedCards.length);
    if (t.customColonies && t.customColonies.length) parts.push('Col:' + t.customColonies.length);

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

  // Setup global features
  setupHotkeys();
  setupLastGameCapture();
})();
