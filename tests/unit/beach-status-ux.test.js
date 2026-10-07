import { explainBeachStatus, isStatusExplainOn } from '../../src/BeachSheet.jsx';
import { describe, test, expect } from 'vitest';

describe('beach status UX explain', () => {
  test('known statuses return distinct non-empty guidance', () => {
    const c = explainBeachStatus('clean', 'fr');
    const m = explainBeachStatus('moderate', 'fr');
    const a = explainBeachStatus('avoid', 'fr');
    expect(c.length).toBeGreaterThan(5);
    expect(m.length).toBeGreaterThan(5);
    expect(a.length).toBeGreaterThan(5);
    expect(new Set([c, m, a]).size).toBe(3);
  });

  test('unknown status gives guidance instead of ellipsis', () => {
    const u = explainBeachStatus('_loading', 'fr');
    expect(u.length).toBeGreaterThan(5);
    expect(u).not.toBe('…');
    expect(u.toLowerCase()).toMatch(/vérification|moment/);
  });

  test('rollback flag defaults ON and ?statusexplain=0 turns OFF', () => {
    expect(isStatusExplainOn('')).toBe(true);
    expect(isStatusExplainOn('?foo=1')).toBe(true);
    expect(isStatusExplainOn('?statusexplain=0')).toBe(false);
  });
});
