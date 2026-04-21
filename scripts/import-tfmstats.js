#!/usr/bin/env node
'use strict';

const path = require('path');

const CANONICAL = path.resolve(__dirname, '..', 'tools', 'data', 'import-tfmstats.js');

require(CANONICAL).main(process.argv.slice(2)).then((code) => process.exit(code));
