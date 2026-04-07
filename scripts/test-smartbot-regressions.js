#!/usr/bin/env node
'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'apps', 'tm-smartbot', 'tests', 'regressions.js');

require(CANONICAL).run();
