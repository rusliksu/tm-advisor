#!/usr/bin/env node
'use strict';

const path = require('path');
const CANONICAL = path.resolve(__dirname, '..', 'apps', 'tm-advisor-py', 'tests', 'advisor_regressions.js');

require(CANONICAL).run();
