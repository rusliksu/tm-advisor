#!/usr/bin/env node
// patch-oom-fix.js — Fix OOM crashes in batch mode
// Restart TM server every 25 games to prevent memory exhaustion

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// Remove any partial patch from previous attempt
if (code.includes('RESTART_EVERY') && !code.includes('restartServer()')) {
  // Partial patch — revert server funcs block
  console.log('Detected partial patch, cleaning up...');
  const startMarker = '// === Server lifecycle management (OOM fix) ===';
  const endMarker = 'let serverProc = null;';
  // Just reload from git to be safe
}

// Fix 1: Add server management functions
{
  const old = "const BASE = 'http://localhost:8081';";

  const replacement = `const BASE = 'http://localhost:8081';

// === Server lifecycle management (OOM fix) ===
const { execSync, spawn } = require('child_process');
const SERVER_DIR = '/home/openclaw/repos/terraforming-mars';
const RESTART_EVERY = 25;
let serverProc = null;

function stopServer() {
  try {
    const pids = execSync("pgrep -f 'node.*server[.]js' || true").toString().trim();
    if (pids) {
      for (const pid of pids.split('\\n')) {
        if (pid) { try { process.kill(parseInt(pid), 'SIGKILL'); } catch(e) {} }
      }
      console.log('Server stopped (PIDs: ' + pids.replace(/\\n/g, ', ') + ')');
    }
  } catch(e) { console.log('stopServer error: ' + e.message); }
}

function startServer() {
  return new Promise((resolve, reject) => {
    try { execSync('rm -f ' + SERVER_DIR + '/db/game.db'); } catch(e) {}
    serverProc = spawn('node', ['build/src/server/server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: '8081' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    serverProc.unref();
    let started = false;
    const timeout = setTimeout(() => { if (!started) reject(new Error('Server start timeout 15s')); }, 15000);
    const poll = setInterval(() => {
      const h = require('http');
      h.get('http://localhost:8081/', (res) => {
        if (!started) { started = true; clearTimeout(timeout); clearInterval(poll); console.log('Server started (PID ' + serverProc.pid + ')'); resolve(); }
      }).on('error', () => {});
    }, 500);
  });
}

async function restartServer() {
  stopServer();
  await new Promise(r => setTimeout(r, 1000));
  await startServer();
}`;

  if (code.includes(old) && !code.includes('RESTART_EVERY')) {
    code = code.replace(old, replacement);
    console.log('OK: server management functions');
    applied++;
  } else {
    console.log('SKIP: server funcs (' + (code.includes('RESTART_EVERY') ? 'already applied' : 'pattern not found') + ')');
  }
}

// Fix 2: Add restartServer() call and periodic restart in runBatch
{
  const old = `async function runBatch(n) {
  const allResults = [];
  for (let i = 1; i <= n; i++) {`;

  const replacement = `async function runBatch(n) {
  const allResults = [];
  await restartServer();
  for (let i = 1; i <= n; i++) {
    if (i > 1 && (i - 1) % RESTART_EVERY === 0) {
      console.log('\\n--- Restarting server (OOM prevention, every ' + RESTART_EVERY + ' games) ---');
      await restartServer();
    }`;

  if (code.includes(old) && !code.includes('await restartServer();')) {
    code = code.replace(old, replacement);
    console.log('OK: runBatch server restart loop');
    applied++;
  } else {
    console.log('SKIP: runBatch loop (' + (code.includes('await restartServer();') ? 'already applied' : 'pattern not found') + ')');
  }
}

// Fix 3: Stop server at end of batch
{
  const old = `  console.log('\\n' + '═'.repeat(60));
  console.log(\`BATCH COMPLETE — \${allResults.length} games\`);
  console.log('═'.repeat(60));`;

  const replacement = `  stopServer();
  console.log('\\n' + '═'.repeat(60));
  console.log(\`BATCH COMPLETE — \${allResults.length} games\`);
  console.log('═'.repeat(60));`;

  // Check for stopServer() call OUTSIDE function definition (i.e., in runBatch)
  const stopInRunBatch = code.indexOf('stopServer()') !== code.indexOf('function stopServer()') - 1
    && code.lastIndexOf('stopServer()') > code.indexOf('async function runBatch');
  if (code.includes(old) && !stopInRunBatch) {
    code = code.replace(old, replacement);
    console.log('OK: stopServer at batch end');
    applied++;
  } else {
    console.log('SKIP: stopServer (' + (stopInRunBatch ? 'already applied' : 'pattern not found') + ')');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
