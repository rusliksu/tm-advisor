const SPECIAL_ENTITY_NAMES = new Set(['Crew Training', 'Lowell', 'Shara']);

const CARD_NAME_VARIANTS = {
  'Darkside Smugglers\\': {
    base: "Darkside Smugglers' Union",
    kind: 'safe_alias',
    note: 'Broken imported key; canonical Moon card name is Darkside Smugglers\' Union.',
  },
  'Hackers:u': {
    base: 'Hackers',
    kind: 'underworld_variant',
    note: 'Underworld variant with its own tags/effects; do not auto-collapse into base card.',
  },
  'Hired Raiders:u': {
    base: 'Hired Raiders',
    kind: 'underworld_variant',
    note: 'Underworld variant with different tags/effects than base card.',
  },
  'Inventors\\': {
    base: "Inventors' Guild",
    kind: 'safe_alias',
    note: 'Broken imported key; canonical project card name is Inventors\' Guild.',
  },
  'Standard Technology:u': {
    base: 'Standard Technology',
    kind: 'underworld_variant',
    note: 'Underworld replacement variant of the base card.',
  },
  'Valuable Gases:Pathfinders': {
    base: 'Valuable Gases',
    kind: 'pathfinders_variant',
    note: 'Pathfinders replacement variant of the base card.',
  },
};

function getAliasInfo(name) {
  return CARD_NAME_VARIANTS[name] || null;
}

function isAliasLike(name) {
  return Boolean(getAliasInfo(name)) || name.includes(':') || name.includes('\\') || /\([IVX]+\)/.test(name);
}

module.exports = {
  SPECIAL_ENTITY_NAMES,
  CARD_NAME_VARIANTS,
  getAliasInfo,
  isAliasLike,
};
