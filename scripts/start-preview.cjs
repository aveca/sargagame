// Start vite preview in background, log PID, and exit cleanly
const { spawn } = require('child_process');
const path = require('path');

const cwd = 'C:\\Users\\user\\Documents\\Backup\\sargagame';

// Use cmd.exe directly with /c to run vite
const proc = spawn(
  process.execPath,
  [path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '8799', '--strictPort'],
  {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }
);

proc.on('error', (e) => console.error('SPAWN ERR:', e.message));
proc.unref();
console.log('PID:', proc.pid);
process.exit(0);
