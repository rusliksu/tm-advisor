// advisor-core.js — обёртка обратной совместимости.
// Вся логика теперь в tm-brain.js, advisor-core.js просто создаёт алиас.
/* eslint-disable */
var TM_ADVISOR = (typeof TM_BRAIN !== 'undefined') ? TM_BRAIN : {};
