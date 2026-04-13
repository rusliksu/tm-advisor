#!/usr/bin/env node
'use strict';

function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

function buildRatingsFromEvaluations(evaluations) {
  const ratings = {};

  for (const [key, card] of Object.entries(evaluations)) {
    const name = card.name || key;
    const score = card.score;
    const tier = card.tier;
    if (score === null || score === undefined || !tier) continue;

    const entry = {s: score, t: tier};

    const openingBias = card.opening_hand_bias;
    if (Number.isInteger(openingBias) && openingBias !== 0) {
      entry.o = openingBias;
    }

    const openingNote = truncate(card.opening_hand_note || '', 120);
    if (openingNote) {
      entry.on = openingNote;
    }

    const synergies = Array.isArray(card.synergies) ? card.synergies.filter((item) => typeof item === 'string' && item) : [];
    if (synergies.length) {
      entry.y = synergies.slice(0, 5);
    }

    const whenToPick = truncate(card.when_to_pick || '', 120);
    if (whenToPick) {
      entry.w = whenToPick;
    }

    const descriptionRu = card.description_ru || '';
    if (descriptionRu) {
      entry.dr = descriptionRu;
    }

    const economy = card.economy || '';
    if (economy) {
      const firstSentence = truncate(String(economy).split('.')[0].trim(), 100);
      if (firstSentence) {
        entry.e = firstSentence;
      }
    }

    ratings[name] = entry;
  }

  return ratings;
}

function serializeJsVariable(varName, value) {
  return `const ${varName}=${JSON.stringify(value)};\n`;
}

module.exports = {
  buildRatingsFromEvaluations,
  serializeJsVariable,
};
