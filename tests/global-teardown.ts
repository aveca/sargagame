import { execSync } from 'child_process';

export default async function() {
  console.log('[global-teardown] Cleaning up...');

  if (process.env.PLAYWRIGHT_STOPPED_SERVER === 'true') {
    try {
      execSync('npx playwright stop-server', { stdio: 'ignore' });
    } catch (_) {}
  }

  console.log('[global-teardown] Done');
}