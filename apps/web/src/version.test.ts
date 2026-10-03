import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Release } from './screens/changelog/Changelog';
import { VERSION } from './version';

const publicDir = new URL('../public', import.meta.url).pathname;
const releases = JSON.parse(readFileSync(`${publicDir}/changelog/changelog.json`, 'utf8')) as Release[];

describe('the changelog', () => {
  it('starts with the version Folio shows, each release 0.0.1 after the one before', () => {
    expect(releases[0]!.version).toBe(VERSION);
    const n = (v: string) => v.split('.').reduce((sum, part) => sum * 1000 + Number(part), 0);
    for (let i = 1; i < releases.length; i++) expect(n(releases[i - 1]!.version) - n(releases[i]!.version)).toBe(1);
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
