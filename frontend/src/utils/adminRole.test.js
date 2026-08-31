/**
 * Admin role vocabulary — and a guard against the check that locks the super admin out.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * Five places in this app gated the Admin Hub on `user.role === 'admin'`. Introducing
 * `super_admin` — the role that MANAGES the Admin Hub — made every one of them exclude
 * exactly the person with the most authority. The backend would have kept answering their
 * requests perfectly; the UI simply would not have routed them there, so it would have
 * looked like a broken login rather than a role check.
 *
 * Nothing announces this. `role === 'admin'` is the natural thing to write, it reads
 * correctly, and it fails only for an account nobody tests with. So the literal is banned
 * outright and the source tree is scanned for it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADMIN_ROLES, isAdminRole, isSuperAdminRole } from './constants';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('isAdminRole', () => {
  it('accepts a plain admin', () => {
    expect(isAdminRole('admin')).toBe(true);
  });

  it('accepts a super admin — who administers the portal and must be able to open it', () => {
    expect(isAdminRole('super_admin')).toBe(true);
  });

  it('rejects a candidate', () => {
    expect(isAdminRole('candidate')).toBe(false);
  });

  it('rejects a missing role rather than throwing', () => {
    // Called as isAdminRole(user?.role) on pages that render before the user loads.
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it('does not match on a prefix', () => {
    expect(isAdminRole('administrator')).toBe(false);
    expect(isAdminRole('admin_readonly')).toBe(false);
  });

  it('matches the backend vocabulary exactly', () => {
    expect([...ADMIN_ROLES].sort()).toEqual(['admin', 'super_admin']);
  });
});

describe('isSuperAdminRole', () => {
  it('is true only for the super admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(isSuperAdminRole('admin')).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

/** Every .js/.jsx file under src, excluding this test and the constants module itself. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no component gates on the bare string "admin"', () => {
  const files = sourceFiles(SRC_DIR).filter((f) => !f.endsWith(path.join('utils', 'constants.js')));

  it('finds source files to scan', () => {
    // A broken walker would make the assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [path.relative(SRC_DIR, f), f]))('%s', (_label, file) => {
    const source = fs.readFileSync(file, 'utf8');
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /\brole\s*(===|==|!==|!=)\s*['"]admin['"]/.test(line));

    expect(
      offenders.map(([n, line]) => `line ${n}: ${line.trim()}`),
      'compares a role against "admin", which excludes super_admin — use isAdminRole()',
    ).toEqual([]);
  });
});
