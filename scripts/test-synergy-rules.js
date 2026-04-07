#!/usr/bin/env node
'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'tools', 'data', 'test-synergy-rules.js');

require(CANONICAL);
