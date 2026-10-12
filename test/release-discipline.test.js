'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGIN_MANIFEST = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_MANIFEST = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const RELEASING_DOC = path.join(ROOT, 'docs', 'contributing', 'releasing.md');
const RAW_PLUGIN_MANIFEST_URL =
  'https://raw.githubusercontent.com/scolladon/craft/main/.claude-plugin/plugin.json';
const VERSION_QUERY = '$.version';
const CHANGELOG_HREF = 'CHANGELOG.md';
const RELEASING_LINK = '](releasing.md)';
const UNRELEASED_HEADING = '## [Unreleased]';
const RELEASED_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const BADGE = /\[!\[[^\]]*\]\((https:\/\/img\.shields\.io\/badge\/dynamic\/json[^)]*)\)\]\(([^)]+)\)/;
const VERSION_LITERAL = /`v(\d+\.\d+\.\d+)`/g;
const CHANGELOG_SURFACE = 'CHANGELOG.md';
const README_SURFACE = 'README.md';
const BAD_PLUGIN_VERSION = '9.9.9';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function pluginVersion() {
  return JSON.parse(fs.readFileSync(PLUGIN_MANIFEST, 'utf8')).version;
}

function compareSemver(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function hasLinkDefinition(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\[${escaped}\\]: \\S+$`, 'm').test(text);
}

function releasedVersions(headings) {
  const released = [];
  const malformed = [];
  for (const heading of headings.filter(line => line !== UNRELEASED_HEADING)) {
    const match = RELEASED_HEADING.exec(heading);
    if (match) released.push(match[1]);
    else malformed.push(`${CHANGELOG_SURFACE}: malformed release heading "${heading}"`);
  }
  return { released, malformed };
}

function orderViolations(released) {
  return released.slice(1)
    .map((version, i) => [released[i], version])
    .filter(([newer, older]) => compareSemver(newer, older) <= 0)
    .map(([newer, older]) => `${CHANGELOG_SURFACE}: ${newer} must be newer than ${older}`);
}

function linkViolations(changelogText, released) {
  return ['Unreleased', ...released]
    .filter(label => !hasLinkDefinition(changelogText, label))
    .map(label => `${CHANGELOG_SURFACE}: missing link definition for [${label}]`);
}

function changelogViolations(changelogText, version) {
  const headings = changelogText.split('\n').filter(line => line.startsWith('## '));
  const { released, malformed } = releasedVersions(headings);
  const violations = [...malformed, ...orderViolations(released), ...linkViolations(changelogText, released)];
  if (headings[0] !== UNRELEASED_HEADING) {
    violations.push(`${CHANGELOG_SURFACE}: first heading must be "${UNRELEASED_HEADING}"`);
  }
  if (released.length > 0 && released[0] !== version) {
    violations.push(`${CHANGELOG_SURFACE}: top release ${released[0]} differs from plugin version ${version}`);
  }
  return violations;
}

function readmeVersionViolations(readmeText, version) {
  return [...readmeText.matchAll(VERSION_LITERAL)]
    .filter(match => match[1] !== version)
    .map(match => `${README_SURFACE}: status literal v${match[1]} differs from plugin version ${version}`);
}

function versionBadgeTarget(readmeText) {
  const match = BADGE.exec(readmeText);
  if (!match) return null;
  const params = new URL(match[1]).searchParams;
  return { url: params.get('url'), query: params.get('query'), href: match[2] };
}

const VALID_CHANGELOG = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [1.0.0] - 2026-07-25',
  '',
  '[Unreleased]: https://example.test/compare/v1.0.0...HEAD',
  '[1.0.0]: https://example.test/releases/tag/v1.0.0',
  ''
].join('\n');

test('Given CHANGELOG.md and the plugin manifest, when the changelog is validated, then it has no violations', () => {
  const changelog = readRepoFile(CHANGELOG_SURFACE);

  const sut = changelogViolations(changelog, pluginVersion());

  assert.deepStrictEqual(sut, []);
});

test('Given a well-formed changelog, when validated against its top version, then it has no violations', () => {
  const sut = changelogViolations(VALID_CHANGELOG, '1.0.0');

  assert.deepStrictEqual(sut, []);
});

test('Given a top release that differs from the plugin version, when the changelog is validated, then CHANGELOG.md is named', () => {
  const sut = changelogViolations(VALID_CHANGELOG, BAD_PLUGIN_VERSION);

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE)));
});

test('Given ascending release headings, when the changelog is validated, then CHANGELOG.md is named', () => {
  const ascending = VALID_CHANGELOG.replace(
    '## [1.0.0] - 2026-07-25',
    '## [1.0.0] - 2026-07-25\n\n## [1.1.0] - 2026-08-01'
  ).replace('[1.0.0]: https', '[1.1.0]: https://example.test/1.1.0\n[1.0.0]: https');

  const sut = changelogViolations(ascending, '1.0.0');

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE) && /newer/.test(message)));
});

test('Given a release heading without its date suffix, when the changelog is validated, then CHANGELOG.md names the malformed heading', () => {
  const undated = VALID_CHANGELOG.replace('## [1.0.0] - 2026-07-25', '## [1.0.0] 2026-07-25');

  const sut = changelogViolations(undated, '1.0.0');

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE) && /malformed/.test(message)), sut.join('\n'));
});

test('Given two identical release headings, when the changelog is validated, then CHANGELOG.md is named', () => {
  const duplicated = VALID_CHANGELOG.replace('## [1.0.0] - 2026-07-25', '## [1.0.0] - 2026-07-25\n\n## [1.0.0] - 2026-07-25');

  const sut = changelogViolations(duplicated, '1.0.0');

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE) && /newer/.test(message)), sut.join('\n'));
});

test('Given a released heading without a link definition, when the changelog is validated, then CHANGELOG.md is named', () => {
  const undefinedLink = VALID_CHANGELOG.replace(/^\[1\.0\.0\]: .*\n/m, '');

  const sut = changelogViolations(undefinedLink, '1.0.0');

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE) && /link definition/.test(message)));
});

test('Given a first heading that is not Unreleased, when the changelog is validated, then CHANGELOG.md is named', () => {
  const noUnreleased = VALID_CHANGELOG.replace(UNRELEASED_HEADING, '## [1.0.0] - 2026-07-25');

  const sut = changelogViolations(noUnreleased, '1.0.0');

  assert.ok(sut.some(message => message.startsWith(CHANGELOG_SURFACE) && /first heading/.test(message)));
});

test('Given README.md, when its backticked version literals are read, then each equals the plugin manifest version', () => {
  const readme = readRepoFile(README_SURFACE);

  const sut = readmeVersionViolations(readme, pluginVersion());

  assert.deepStrictEqual(sut, []);
});

test('Given a stale backticked version literal, when README is validated, then README.md is named', () => {
  const sut = readmeVersionViolations('Current status: `v9.9.9`.', pluginVersion());

  assert.strictEqual(sut.length, 1);
  assert.ok(sut[0].startsWith(README_SURFACE));
});

test('Given the marketplace manifest, when its plugin entries are read, then none carries a version', () => {
  const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_MANIFEST, 'utf8'));

  const sut = marketplace.plugins.filter(entry => 'version' in entry);

  assert.deepStrictEqual(sut, []);
});

test('Given README.md, when the version badge is read, then it reads the plugin manifest version field and links the changelog', () => {
  const readme = readRepoFile(README_SURFACE);

  const sut = versionBadgeTarget(readme);

  assert.ok(sut, 'version badge is absent');
  assert.strictEqual(sut.url, RAW_PLUGIN_MANIFEST_URL);
  assert.strictEqual(sut.query, VERSION_QUERY);
  assert.strictEqual(sut.href, CHANGELOG_HREF);
  assert.ok(fs.existsSync(PLUGIN_MANIFEST));
});

test('Given the contributor docs map, when the release procedure is looked up, then it exists and is linked', () => {
  const map = readRepoFile(path.join('docs', 'contributing', 'README.md'));

  const sut = { exists: fs.existsSync(RELEASING_DOC), linked: map.includes(RELEASING_LINK) };

  assert.deepStrictEqual(sut, { exists: true, linked: true });
});
