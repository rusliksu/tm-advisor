'use strict';

const fs = require('fs');
const path = require('path');

const CANONICAL_DIR = path.join(__dirname, '..', 'packages', 'tm-data', 'generated', 'bot');

function resolveBotDataPath(filename) {
  const canonicalPath = path.join(CANONICAL_DIR, filename);
  if (fs.existsSync(canonicalPath)) {
    return canonicalPath;
  }
  return path.join(__dirname, filename);
}

function loadCardTags() {
  const rawTags = require(resolveBotDataPath('card_tags.js'));
  const cardData = require(resolveBotDataPath('card_data.js'));
  const normalized = {};

  for (const [name, tags] of Object.entries(rawTags)) {
    normalized[name] = Array.isArray(tags) ? [...tags] : [];
  }

  for (const [name, data] of Object.entries(cardData)) {
    const tags = normalized[name] || [];
    if (String(data?.type || '').toLowerCase() === 'event' && !tags.includes('event')) {
      tags.push('event');
    }
    normalized[name] = tags;
  }

  return normalized;
}

const CARD_DATA = require(resolveBotDataPath('card_data.js'));

module.exports = {
  CARD_TAGS: loadCardTags(),
  CARD_VP: require(resolveBotDataPath('card_vp.js')),
  CARD_DATA,
  CARD_GLOBAL_REQS: require(resolveBotDataPath('card_global_reqs.js')),
};
