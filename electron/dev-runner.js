const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

console.log('🧊 Starting Frosten IDE development runner...');

const VITE_PORT = 5173;
const VITE_URL = `http://localhost:${VITE_PORT}`;

let electronStarted = false;
let electronProcess = null;

// Wait for Vite dev server to actually be ready by polling it
function waitForVite(maxWaitMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const interval = setInterval(() => {
      http.get(VITE_URL, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304 || res.statusCode === 404) {
          clearInterval(interval);
          resolve();
        }
      }).on('error', () => {
        // Not ready yet, keep polling
        if (Date.now() - started > maxWaitMs) {
          clearInterval(interval);
          reject(new Error('Vite server did not start within timeout'));
        }
      });
    }, 300);
  });
}

function startElectron() {
  if (electronStarted) return;
  electronStarted = true;

  console.log('✅ Vite server ready. Launching Electron...');

  electronProcess = spawn('node', ['node_modules/electron/cli.js', '.', '--dev'], {
    shell: false,
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { 
      ...process.env, 
      VITE_DEV_SERVER_URL: VITE_URL,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  });

  electronProcess.on('close', (code) => {
    console.log(`Electron exited (code ${code}). Shutting down...`);
    vite.kill('SIGTERM');
    setTimeout(() => process.exit(code || 0), 500);
  });

  electronProcess.on('error', (err) => {
    console.error('Electron launch error:', err);
    vite.kill('SIGTERM');
    process.exit(1);
  });
}

// Spawn Vite Dev Server
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--strictPort'], {
  shell: false,
  stdio: 'pipe',
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, FORCE_COLOR: '1' }
});

vite.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(`[Vite] ${output}`);
});

vite.stderr.on('data', (data) => {
  const txt = data.toString();
  // Suppress benign Vite CJS deprecation warnings
  if (!txt.includes('CJS build of Vite')) {
    process.stderr.write(`[Vite] ${txt}`);
  }
});

vite.on('error', (err) => {
  console.error('Failed to start Vite process:', err);
  process.exit(1);
});

vite.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Vite exited with code ${code}`);
    if (electronProcess) electronProcess.kill();
    process.exit(code);
  }
});

// Wait for Vite HTTP server then launch Electron
waitForVite(30000)
  .then(startElectron)
  .catch((err) => {
    console.error('Vite startup failed:', err.message);
    vite.kill();
    process.exit(1);
  });

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping Frosten IDE...');
  if (electronProcess) electronProcess.kill('SIGTERM');
  vite.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  if (electronProcess) electronProcess.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(0);
});
