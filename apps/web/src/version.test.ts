import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Release } from './screens/changelog/Changelog';
import { VERSION } from './version';

const publicDir = new URL('../public', import.meta.url).pathname;
const releases = JSON.parse(readFileSync(`${publicDir}/changelog/changelog.json`, 'utf8')) as Release[];

describe('the changelog', () => {
  it('starts with the version Folio shows, each release 0.0.1 after the one before or a checkpoint', () => {
    expect(releases[0]!.version).toBe(VERSION);
    const n = (v: string) => v.split('.').reduce((sum, part) => sum * 1000 + Number(part), 0);
    // A checkpoint starts the next minor version at 0: 0.0.36 is followed by 0.1.0.
    const checkpoint = (v: string) => /^\d+\.\d+\.0$/.test(v);
    for (let i = 1; i < releases.length; i++) if (!checkpoint(releases[i - 1]!.version)) expect(n(releases[i - 1]!.version) - n(releases[i]!.version)).toBe(1);
  });

  it('shows only pictures that are there, each described', () => {
    for (const release of releases)
      for (const section of release.sections) {
        if (!section.image) continue;
        expect(existsSync(publicDir + section.image.src), section.image.src).toBe(true);
        expect(section.image.alt.length).toBeGreaterThan(10);
      }
  });
});
