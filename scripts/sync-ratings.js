#!/usr/bin/env node
'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'tools', 'data', 'sync-ratings.js');

process.exit(require(CANONICAL).main(process.argv.slice(2)));
