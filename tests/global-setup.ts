import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

export default async function() {
  console.log('[global-setup] Building production bundle...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
    console.log('[global-setup] Build completed successfully');
  } catch (e) {
    console.error('[global-setup] Build failed:', e);
    process.exit(1);
  }

  if (!existsSync('test-results')) {
    mkdirSync('test-results', { recursive: true });
  }

  const buildMeta = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
    branch: process.env.GITHUB_REF_NAME || 'local',
    version: execSync('git describe --tags --always', { encoding: 'utf-8', stdio: 'pipe' }).trim(),
  };
  writeFileSync('test-results/build-meta.json', JSON.stringify(buildMeta, null, 2));

  console.log('[global-setup] Ready for tests');
}