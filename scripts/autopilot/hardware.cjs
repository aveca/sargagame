'use strict';
/**
 * hardware.cjs — détection locale du matériel (GPU, VRAM, RAM, CPU).
 * Zéro dépendance cloud. Utilise wmic (Windows) ou /proc (Linux).
 */

const { execFileSync, execSync } = require('child_process');
const os = require('os');

function detectGPU() {
  const gpus = [];
  
  if (process.platform === 'win32') {
    try {
      // wmic path win32_VideoController get Name,AdapterRAM,DriverVersion
      const out = execFileSync('wmic', ['path', 'win32_VideoController', 'get', 'Name,AdapterRAM,DriverVersion', '/format:csv'], { 
        encoding: 'utf8', timeout: 10000, windowsHide: true 
      });
      const lines = out.trim().split('\n').slice(1); // skip header
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const name = parts[2]?.trim();
          const vram = parseInt(parts[1]?.trim() || '0', 10);
          const driver = parts[3]?.trim();
          if (name) {
            gpus.push({ name, vramBytes: vram, vramGB: vram > 0 ? +(vram / 1073741824).toFixed(2) : null, driver, platform: 'windows' });
          }
        }
      }
    } catch (e) {
      // fallback: try nvidia-smi
      try {
        const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { 
          encoding: 'utf8', timeout: 10000, windowsHide: true 
        });
        for (const line of out.trim().split('\n')) {
          const [name, mem, driver] = line.split(',').map(s => s.trim());
          if (name) {
            gpus.push({ name, vramBytes: parseInt(mem || '0', 10) * 1024 * 1024, vramGB: parseFloat(mem || '0') / 1024, driver, platform: 'windows' });
          }
        }
      } catch (_) {}
    }
  } else {
    // Linux
    try {
      const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { 
        encoding: 'utf8', timeout: 10000 
      });
      for (const line of out.trim().split('\n')) {
        const [name, mem, driver] = line.split(',').map(s => s.trim());
        if (name) {
          gpus.push({ name, vramBytes: parseInt(mem || '0', 10) * 1024 * 1024, vramGB: parseFloat(mem || '0') / 1024, driver, platform: 'linux' });
        }
      }
    } catch (_) {
      // try lspci
      try {
        const out = execFileSync('lspci', ['-nn'], { encoding: 'utf8', timeout: 5000 });
        for (const line of out.trim().split('\n')) {
          if (/VGA|3D|Display/.test(line)) {
            gpus.push({ name: line.trim(), vramBytes: 0, vramGB: null, driver: 'unknown', platform: 'linux' });
          }
        }
      } catch (__) {}
    }
  }
  
  return gpus;
}

function detectRAM() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  return {
    totalBytes,
    freeBytes,
    totalGB: +(totalBytes / 1073741824).toFixed(2),
    freeGB: +(freeBytes / 1073741824).toFixed(2),
    usedGB: +((totalBytes - freeBytes) / 1073741824).toFixed(2),
    usagePercent: +((1 - freeBytes / totalBytes) * 100).toFixed(1)
  };
}

function detectCPU() {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model || 'unknown',
    cores: cpus.length,
    speedMHz: cpus[0]?.speed || 0,
    arch: os.arch(),
    platform: os.platform()
  };
}

function detectDisk() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('wmic', ['logicaldisk', 'get', 'Size,FreeSpace,DeviceID', '/format:csv'], { 
        encoding: 'utf8', timeout: 10000, windowsHide: true 
      });
      const lines = out.trim().split('\n').slice(1);
      const disks = [];
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const device = parts[1]?.trim();
          const size = parseInt(parts[3]?.trim() || '0', 10);
          const free = parseInt(parts[2]?.trim() || '0', 10);
          if (device && size > 0) {
            disks.push({ device, sizeGB: +(size / 1073741824).toFixed(2), freeGB: +(free / 1073741824).toFixed(2) });
          }
        }
      }
      return disks;
    } else {
      const out = execSync('df -h /', { encoding: 'utf8', timeout: 5000 });
      const lines = out.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          return [{ device: parts[0], sizeGB: parts[1], freeGB: parts[3], usage: parts[4] }];
        }
      }
    }
  } catch (_) {}
  return [];
}

function detectOllama() {
  try {
    const out = execFileSync('ollama', ['list'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    const models = [];
    for (const line of out.trim().split('\n').slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        models.push({
          name: parts[0],
          size: parts[2] + ' ' + parts[3],
          digest: parts[1]
        });
      }
    }
    return { available: true, models, count: models.length };
  } catch (e) {
    return { available: false, models: [], count: 0, error: e.message };
  }
}

function detectComfyUI() {
  // Check if ComfyUI is running locally (sync version - no fetch in main thread)
  // This will be called from async context if needed
  return { available: false, note: 'async check required' };
}

async function detectComfyUIAsync() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch('http://127.0.0.1:8188/system_stats', { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) return { available: true, url: 'http://127.0.0.1:8188' };
  } catch (_) {}
  return { available: false };
}

async function detectHardware() {
  const gpu = detectGPU();
  const ram = detectRAM();
  const cpu = detectCPU();
  const disk = detectDisk();
  const ollama = detectOllama();
  // Note: ComfyUI detection requires fetch which isn't available in sync context
  
  return {
    timestamp: new Date().toISOString(),
    gpu,
    ram,
    cpu,
    disk,
    ollama,
    summary: {
      hasGPU: gpu.length > 0,
      totalVRAM_GB: gpu.reduce((a, g) => a + (g.vramGB || 0), 0),
      totalRAM_GB: ram.totalGB,
      freeRAM_GB: ram.freeGB,
      cpuCores: cpu.cores,
      ollamaModels: ollama.count,
      canRun30B: (gpu.reduce((a, g) => a + (g.vramGB || 0), 0) >= 20 || ram.freeGB >= 24),
      canRun14B: (gpu.reduce((a, g) => a + (g.vramGB || 0), 0) >= 10 || ram.freeGB >= 16),
      canRun7B: (gpu.reduce((a, g) => a + (g.vramGB || 0), 0) >= 6 || ram.freeGB >= 10)
    }
  };
}

module.exports = { detectHardware, detectGPU, detectRAM, detectCPU, detectDisk, detectOllama };

if (require.main === module) {
  detectHardware().then(h => console.log(JSON.stringify(h, null, 2))).catch(e => console.error(e));
}