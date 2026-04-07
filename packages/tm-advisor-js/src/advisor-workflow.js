/* eslint-disable */
(function(root) {
  'use strict';

  function collectWorkflowCardNames(node, out, seenSet, depth) {
    if (!node || depth > 8) return out;
    if (Array.isArray(node)) {
      for (var ai = 0; ai < node.length; ai++) {
        collectWorkflowCardNames(node[ai], out, seenSet, depth + 1);
      }
      return out;
    }
    if (node.cards && Array.isArray(node.cards)) {
      for (var ci = 0; ci < node.cards.length; ci++) {
        var card = node.cards[ci];
        var name = card && (card.name || card);
        if (name && !seenSet[name]) {
          out.push(name);
          seenSet[name] = true;
        }
      }
    }
    if (node.options && Array.isArray(node.options)) {
      for (var oi = 0; oi < node.options.length; oi++) {
        collectWorkflowCardNames(node.options[oi], out, seenSet, depth + 1);
      }
    }
    if (node.andOptions && Array.isArray(node.andOptions)) {
      for (var adi = 0; adi < node.andOptions.length; adi++) {
        collectWorkflowCardNames(node.andOptions[adi], out, seenSet, depth + 1);
      }
    }
    return out;
  }

  var api = {
    collectWorkflowCardNames: function(node) {
      return collectWorkflowCardNames(node, [], {}, 0);
    }
  };

  root.TM_ADVISOR_WORKFLOW = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
