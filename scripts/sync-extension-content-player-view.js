#!/usr/bin/env node
'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'tools', 'extension', 'sync-content-player-view.js');
process.exit(require(CANONICAL).main(process.argv.slice(2)));
