'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'tools', 'architecture', 'check-modules.js');

process.exit(require(CANONICAL).run() ? 0 : 1);
