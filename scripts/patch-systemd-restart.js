#!/usr/bin/env node
// patch-systemd-restart.js
// Replace manual server start/stop with systemctl --user commands
// Fixes conflict where smartbot kills server but systemd Restart=always brings it back

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');

// Replace stopServer
{
  const old = `function stopServer() {
  try {
    const pids = execSync("pgrep -f 'node.*server[.]js' || true").toString().trim();
    if (pids) {
      for (const pid of pids.split('\\n')) {
        if (pid) { try { process.kill(parseInt(pid), 'SIGKILL'); } catch(e) {} }
      }
      console.log('Server stopped (PIDs: ' + pids.replace(/\\n/g, ', ') + ')');
    }
  } catch(e) { console.log('stopServer error: ' + e.message); }
}`;

  const replacement = `function stopServer() {
  try {
    execSync('systemctl --user stop tm-server.service 2>/dev/null || true');
    console.log('Server stopped (systemd)');
  } catch(e) { console.log('stopServer: ' + e.message); }
}`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: patched stopServer to use systemd');
  } else {
    console.log('SKIP: stopServer pattern not found');
  }
}

// Replace startServer
{
  const old = `function startServer() {
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
}`;

  const replacement = `function startServer() {
  return new Promise((resolve, reject) => {
    try { execSync('rm -f ' + SERVER_DIR + '/db/game.db'); } catch(e) {}
    try { execSync('systemctl --user start tm-server.service'); } catch(e) { return reject(e); }
    let started = false;
    const timeout = setTimeout(() => { if (!started) reject(new Error('Server start timeout 15s')); }, 15000);
    const poll = setInterval(() => {
      const h = require('http');
      h.get('http://localhost:8081/', (res) => {
        if (!started) { started = true; clearTimeout(timeout); clearInterval(poll); console.log('Server started (systemd)'); resolve(); }
      }).on('error', () => {});
    }, 500);
  });
}`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: patched startServer to use systemd');
  } else {
    console.log('SKIP: startServer pattern not found');
  }
}

// Replace restartServer
{
  const old = `async function restartServer() {
  stopServer();
  await new Promise(r => setTimeout(r, 1000));
  await startServer();
}`;

  const replacement = `async function restartServer() {
  try { execSync('rm -f ' + SERVER_DIR + '/db/game.db'); } catch(e) {}
  try { execSync('systemctl --user restart tm-server.service'); } catch(e) {}
  await new Promise(r => setTimeout(r, 3000));
  // wait for server ready
  await new Promise((resolve, reject) => {
    let started = false;
    const timeout = setTimeout(() => { if (!started) reject(new Error('Server restart timeout')); }, 15000);
    const poll = setInterval(() => {
      const h = require('http');
      h.get('http://localhost:8081/', (res) => {
        if (!started) { started = true; clearTimeout(timeout); clearInterval(poll); console.log('Server restarted (systemd)'); resolve(); }
      }).on('error', () => {});
    }, 500);
  });
}`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: patched restartServer to use systemd');
  } else {
    console.log('SKIP: restartServer pattern not found');
  }
}

fs.writeFileSync(file, code);
console.log('Done');
