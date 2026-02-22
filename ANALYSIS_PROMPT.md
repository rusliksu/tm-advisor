# Пост-анализ игры Terraforming Mars

## Как использовать

После игры экспортируй JSON лог (Shift+L в расширении) и запусти:

```
claude "прочитай ANALYSIS_PROMPT.md и проанализируй лог" --file tm-game-genX-2026-XX-XX.json
```

---

## Инструкция для Claude Code

Ты анализируешь JSON лог игры Terraforming Mars. Цель — найти ошибки скоринга и исправить файлы расширения.

### Структура JSON

```
{
  version: 2,
  myColor: "red",           // цвет нашего игрока
  myCorp: "Tharsis Republic",
  players: [{name, color, corp, isMe}],
  map: "tharsis",
  generations: {
    "1": {
      snapshot: {
        globalParams: {temp, oxy, venus, oceans},
        players: {
          "red": {tr, mc, mcProd, steel, steelProd, ti, tiProd, plants, plantProd,
                  energy, energyProd, heat, heatProd, cardsInHand, tableau: [...],
                  lastCard, tags: {building:3, space:2, ...}, vp, colonies, cities},
          "blue": {...}, "green": {...}
        }
      },
      actions: [{ts, text, type}]  // лог действий из API
    }
  },
  draftLog: [
    {
      round: 1,
      offered: [
        {name: "Birds", total: 76, tier: "B", baseTier: "B", baseScore: 76, reasons: ["Corp synergy +5", "Animal tag ×3: +3"]},
        {name: "Ants", total: 45, tier: "D", baseTier: "C", baseScore: 58, reasons: [...]}
      ],
      taken: "Birds",       // что взяли
      passed: ["Ants"]      // что пропустили
    }
  ],
  genTimes: [{gen, duration}],
  finalScores: {
    "red": {total: 87, tr: 45, milestones: 5, awards: 5, greenery: 5, city: 12, cards: 15},
    "blue": {...}, "green": {...}
  }
}
```

### Что анализировать

#### 1. Результат игры
- Кто выиграл и с каким счётом?
- Какая стратегия сработала (теги, карты, milestone/awards)?
- Сколько поколений длилась игра?

#### 2. Draft-решения — правильность скоринга
Для каждого драфт-решения:
- Карта взята → она реально сыграна в tableau? Если нет — overpick
- Карта пропущена с высоким скором → ошибка скоринга (false positive)
- Карта взята с низким скором → ошибка скоринга (false negative), или это contex-pick

**Ключевые метрики:**
- `hit_rate` = % взятых карт, которые реально были сыграны
- `score_accuracy` = корреляция между predicted score и реальным вкладом карты

#### 3. Динамика по поколениям
Сравни снапшоты между поколениями:
- TR рост по поколениям (нормальный = +3-5 TR/пок)
- Когда engine заработал (рост прода)
- Переломный момент (когда один игрок вырвался вперёд)

#### 4. Карты, которые стоит пересмотреть
Найди карты где скоринг ошибся:
- **Overscored**: высокий total в драфте, но карта не сыграна / не принесла VP
- **Underscored**: низкий total, но карта оказалась ключевой у победителя
- **Timing wrong**: карта сыграна поздно, хотя скоринг считал её ранней

### Что исправлять

#### Файл: `extension/data/card_effects.json.js`
- Неправильные значения эффектов (прод, ресурсы, TR, параметры)
- Отсутствующие карты (добавить с корректными эффектами)

#### Файл: `extension/content.js` → `scoreDraftCard()` (строка ~3006)
- Веса факторов (46 факторов, каждый ±N к бонусу)
- Формулы расчёта (tag density, synergy detection, saturation)
- Пороги (когда карта "дорогая", когда "поздно")

#### Файл: `extension/data/combos.json.js`
- Новые комбо, обнаруженные в игре (карты, которые сработали вместе)
- Anti-combos (карты, которые мешали друг другу)

### Формат ответа

```markdown
## Результат игры
[краткая сводка]

## Ошибки скоринга
| Карта | Predicted | Реальность | Проблема | Фикс |
|-------|-----------|------------|----------|------|
| X     | 82/A      | Не сыграна | Overscored: req не выполнен | Добавить req penalty |

## Предложенные правки
### card_effects.json.js
- `"CardName":{c:X,...}` → `{c:X,...,fix}` — причина

### scoreDraftCard() factor N
- Текущий вес: +5
- Предложение: +3
- Причина: ...

### Новые комбо
- Card1 + Card2 → rating: good, описание

## Общие выводы
[что работает хорошо, что нужно менять системно]
```

### Важно
- НЕ менять базовые оценки TM_RATINGS без весомых причин (они откалиброваны по десятку игр)
- Менять ДИНАМИЧЕСКИЕ факторы в scoreDraftCard() — они контекстные
- Одна игра = одна точка данных. Для изменения весов нужно 3+ игр с одной и той же проблемой
- Помечай уверенность: HIGH (явная ошибка данных), MEDIUM (паттерн), LOW (одна игра)
