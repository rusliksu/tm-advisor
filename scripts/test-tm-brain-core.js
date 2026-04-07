const path = require('path');
const CANONICAL = path.resolve(__dirname, '..', 'tools', 'brain', 'test-core.js');

process.exit(require(CANONICAL).main());
