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

module.exports = {
  CARD_TAGS: require(resolveBotDataPath('card_tags.js')),
  CARD_VP: require(resolveBotDataPath('card_vp.js')),
  CARD_DATA: require(resolveBotDataPath('card_data.js')),
  CARD_GLOBAL_REQS: require(resolveBotDataPath('card_global_reqs.js')),
};
