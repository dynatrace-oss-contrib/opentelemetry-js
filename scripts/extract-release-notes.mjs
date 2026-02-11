#!/usr/bin/env node
/**
 * Script to extract and combine changelog entries for a release PR.
 * Automatically detects which changelogs to include based on environment variables.
 */

import { execSync } from 'child_process';

const RELEASE_TYPE_API = process.env.RELEASE_TYPE_API;
const RELEASE_TYPE_STABLE = process.env.RELEASE_TYPE_STABLE;
const RELEASE_TYPE_EXPERIMENTAL = process.env.RELEASE_TYPE_EXPERIMENTAL;
const RELEASE_TYPE_SEMCONV = process.env.RELEASE_TYPE_SEMCONV;

const changelogs = [];

if (RELEASE_TYPE_API) {
  changelogs.push('api/CHANGELOG.md');
}
if (RELEASE_TYPE_STABLE) {
  changelogs.push('./CHANGELOG.md');
}
if (RELEASE_TYPE_EXPERIMENTAL) {
  changelogs.push('experimental/CHANGELOG.md');
}
if (RELEASE_TYPE_SEMCONV) {
  changelogs.push('semantic-conventions/CHANGELOG.md');
}

if (changelogs.length === 0) {
  console.error('Error: No changelogs to extract (no release types set)');
  process.exit(1);
}

console.log('Extracting release notes from:', changelogs.join(', '));

try {
  execSync(`node scripts/extract-latest-release-notes.js ${changelogs.join(' ')}`, { stdio: 'inherit' });
} catch (err) {
  console.error('Error extracting release notes:', err.message);
  process.exit(1);
}
