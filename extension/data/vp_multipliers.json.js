// TM_VP_MULTIPLIERS — карты с VP, зависящими от количества тегов/ресурсов/условий.
// Используется в scoreDraftCard() секция 21b для проекции реального VP.

/* eslint-disable */
const TM_VP_MULTIPLIERS = {

  // ══════════════════════════════════════════════════════════════
  // VP PER JOVIAN TAG (1 VP за каждый Jovian тег включая себя)
  // ══════════════════════════════════════════════════════════════
  "Water Import From Europa":    { vpPer: "jovian", rate: 1, selfTags: ["jovian","space"] },
  "Terraforming Ganymede":       { vpPer: "jovian", rate: 1, selfTags: ["jovian","space"] },
  "Io Mining Industries":        { vpPer: "jovian", rate: 1, selfTags: ["jovian","space"] },
  "Ganymede Colony":             { vpPer: "jovian", rate: 1, selfTags: ["jovian","space"] },

  // ══════════════════════════════════════════════════════════════
  // VP PER SCIENCE TAG
  // ══════════════════════════════════════════════════════════════
  "Venusian Animals":            { vpPer: "science", rate: 1, selfTags: ["venus","science","animal"] },
  "Search For Life":             { vpPer: "flat_conditional", vpFlat: 3, selfTags: ["science"] },

  // ══════════════════════════════════════════════════════════════
  // VP PER EARTH TAG
  // ══════════════════════════════════════════════════════════════
  "Satellites":                  { vpPer: "space", rate: 1, selfTags: ["space"] },

  // ══════════════════════════════════════════════════════════════
  // VP PER N RESOURCES ON SELF (action accumulators)
  // ══════════════════════════════════════════════════════════════
  "Tardigrades":                 { vpPer: "self_resource", divisor: 4, selfTags: ["microbe"] },
  "Venusian Insects":            { vpPer: "self_resource", divisor: 2, selfTags: ["venus","microbe"] },
  "Sub-zero Salt Fish":          { vpPer: "self_resource", divisor: 2, selfTags: ["animal"] },
  "Regolith Eaters":             { vpPer: "self_resource", divisor: 3, selfTags: ["science","microbe"] },
  "GHG Producing Bacteria":     { vpPer: "self_resource", divisor: 3, selfTags: ["science","microbe"] },
  "Nitrite Reducing Bacteria":   { vpPer: "self_resource", divisor: 3, selfTags: ["microbe"] },
  "Extremophiles":               { vpPer: "self_resource", divisor: 3, selfTags: ["venus","microbe"] },
  "Dirigibles":                  { vpPer: "self_resource", divisor: 3, selfTags: ["venus"] },
  "Floating Habs":               { vpPer: "self_resource", divisor: 2, selfTags: ["venus"] },
  "Atmo Collectors":             { vpPer: "self_resource", divisor: 3, selfTags: [] },
  "Jovian Lanterns":             { vpPer: "self_resource", divisor: 2, selfTags: ["jovian"] },

  // ══════════════════════════════════════════════════════════════
  // VP PER CONDITION (cities, greeneries, etc.)
  // ══════════════════════════════════════════════════════════════
  "Immigration Shuttles":        { vpPer: "all_cities", divisor: 3, selfTags: ["earth","space"] },
  "Herbivores":                  { vpPer: "self_resource", divisor: 2, selfTags: ["animal","plant"] },
  "Ecological Zone":             { vpPer: "self_resource", divisor: 2, selfTags: ["animal","plant"] },

  // ══════════════════════════════════════════════════════════════
  // VP PER ANIMAL ON SELF (1:1)
  // ══════════════════════════════════════════════════════════════
  "Birds":                       { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Fish":                        { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Small Animals":               { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Livestock":                   { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Predators":                   { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Penguins":                    { vpPer: "self_resource", divisor: 1, selfTags: ["animal"] },
  "Pets":                        { vpPer: "self_resource", divisor: 1, selfTags: ["animal","earth"] },
  "Stratospheric Birds":         { vpPer: "self_resource", divisor: 1, selfTags: ["venus","animal"] },

};
