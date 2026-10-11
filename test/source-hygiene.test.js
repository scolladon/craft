'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Explicit scanned-path list (not `grep -r .`):
// engine/test/, scripts/, .claude/, examples/, and dated docs are NEVER scanned.
const SCANNED_PATHS = [
  path.join(ROOT, 'pipeline'),
  path.join(ROOT, 'skills'),
  path.join(ROOT, 'agents'),
  path.join(ROOT, 'contracts'),
  path.join(ROOT, 'templates'),
  path.join(ROOT, 'engine/src'),
  path.join(ROOT, 'docs/contributing/specs'),
  path.join(ROOT, 'docs/contributing/DOD.md'),
  path.join(ROOT, 'docs/guides/customizing.md'),
  path.join(ROOT, 'README.md'),
];

// Class A: technique-specific tool and concept names that must not appear in plugin sources.
const CLASS_A_PATTERN =
  'stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise';

// Class B: VCS-host CLI references (word-boundary to avoid substrings like
// "through", "weight", "light", "high", "right").
const CLASS_B_PATTERN = '\\bgh\\b|\\bgithub\\b';

// Class C: vendor-suffixed source basenames must live under adapters/<vendor>/ — the
// vendor-binding location contract (ADR-191). A vendor-named file outside that segment
// is a stray binding leaking vendor coupling into the neutral core.
const VENDOR_SUFFIXES = ['claude', 'anthropic', 'openai', 'gemini'];
const CLASS_C_PATTERN = new RegExp(`-(${VENDOR_SUFFIXES.join('|')})\\.(js|ts)$`);

// README.md public front door: the project's own canonical repo URL (install
// command, CI badge) is a pinned public address, not a VCS-host CLI reference.
// The filter excuses ONLY the URL token: it strips every canonical-URL
// occurrence and re-scans the residue, so a bare `gh`/`github` co-located on
// the same README line still trips the gate.
const README_CANONICAL_URL = 'github.com/scolladon/craft';
const readmeCanonicalUrlOnlyFilter = {
  test: (line) =>
    /README\.md:[0-9]+:/.test(line) &&
    line.includes(README_CANONICAL_URL) &&
    !new RegExp(CLASS_B_PATTERN).test(line.split(README_CANONICAL_URL).join('')),
};

// Class D: absolute home-rooted paths leak the author's OS username and workspace layout.
// Whole tracked tree on purpose — dated docs and test fixtures carried every past leak.
// Fail-closed anchor: a home root counts unless a path-segment character (an elision `…`
// included) sits right before it, so every other predecessor (quote, operator, diff marker) anchors.
const NOT_AFTER_PATH_CHAR = '(?<![A-Za-z0-9._~$…])';
// A home root may sit under a URL scheme, a WSL drive mount, or a relocated home volume.
const HOME_ROOT_PREFIX = '(?:file://|/mnt/[a-z]|/private/var|/var|/run/host|/System/Volumes/Data|/Volumes/[^/]+)?';
const HOME_SLASH_PATTERN = new RegExp(
  `${NOT_AFTER_PATH_CHAR}${HOME_ROOT_PREFIX}/(?:Users|home)/([A-Za-z0-9._-]+)`,
  'gi',
);
// `-` also blocks the dashed form, so a `--home-…` CLI flag never reads as a projects dir;
// a Windows drive (`C--Users-…`) is matched through its letter. The segment may end the name.
const NOT_AFTER_DASHED_CHAR = '(?<![A-Za-z0-9._~$…-])';
const HOME_DASHED_PATTERN = new RegExp(
  `${NOT_AFTER_DASHED_CHAR}(?:[A-Za-z]-)?-(?:Users|home)-([A-Za-z0-9._]+)`,
  'gi',
);
const PLACEHOLDER_HOMES = new Set(['alice', 'example', 'me', 'someone', 'user', 'x', 'other-clone']);
const HOME_CANDIDATE_PATTERN = '/(Users|home)/|-(Users|home)-';
const GIT_GREP_NO_MATCH = 1;
// `s`: a CRLF row keeps its trailing \r, which `.` would otherwise refuse to match.
const LOCATED_LINE_PATTERN = /^(.+?):(\d+):(.*)$/s;

function findHomePathLeaks(line) {
  return [HOME_SLASH_PATTERN, HOME_DASHED_PATTERN]
    .flatMap((pattern) => [...line.matchAll(pattern)])
    .map((match) => match[1])
    .filter((segment) => !PLACEHOLDER_HOMES.has(segment));
}

function listHomePathCandidateLines(cwd) {
  try {
    // -a: a NUL byte must not hide a captured fixture from the scan as "binary".
    return execFileSync('git', ['grep', '-naiE', HOME_CANDIDATE_PATTERN], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    if (err.status === GIT_GREP_NO_MATCH) return [];
    throw err;
  }
}

function locateCandidate(candidate) {
  const located = candidate.match(LOCATED_LINE_PATTERN);
  // The row text is never echoed: it may be the very leak this class exists to keep out of CI logs.
  if (!located) throw new Error(`class D: unparsable git grep row of ${candidate.length} chars`);
  return { file: located[1], line: located[2], text: located[3] };
}

function listHomePathLeakLocations(candidates) {
  return candidates
    .map(locateCandidate)
    .filter((located) => findHomePathLeaks(located.text).length > 0)
    .map((located) => `${located.file}:${located.line}`);
}

function runGrep(pattern, paths, allowlistFilters) {
  let result;
  try {
    result = execFileSync('grep', ['-rEn', pattern, ...paths], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // grep exits non-zero when no matches found — that's the success case
    result = err.stdout ?? '';
  }
  let lines = result.split('\n').filter(Boolean);
  for (const filter of allowlistFilters) {
    lines = lines.filter((line) => !filter.test(line));
  }
  return lines;
}

function listTrackedFiles(paths) {
  let result;
  try {
    result = execFileSync('git', ['ls-files', '--', ...paths], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    result = err.stdout ?? '';
  }
  return result.split('\n').filter(Boolean);
}

function findMisplacedVendorFiles(filePaths) {
  return filePaths.filter((filePath) => {
    const match = CLASS_C_PATTERN.exec(path.basename(filePath));
    if (!match) {
      return false;
    }
    const vendor = match[1];
    return !filePath.includes(`adapters/${vendor}/`);
  });
}

test(
  'Given the scanned-path list, when each entry is resolved against the tracked tree, then every entry yields at least one tracked file',
  () => {
    // A scanned path that stops existing silently drops out of the class-A/B
    // scans (grep's error is swallowed to zero hits) — pin each entry
    // positively so a moved or renamed location fails loud here instead.
    for (const scannedPath of SCANNED_PATHS) {
      const relative = path.relative(ROOT, scannedPath);
      const tracked = listTrackedFiles([relative]);
      assert.ok(
        tracked.length > 0,
        `Source-hygiene FAIL — scanned path has no tracked files (stale entry?): ${relative}`,
      );
    }
  },
);

test(
  'Given Parts 1-10 removed technique names, when class-A tokens are grepped across the scanned set, then zero un-allowlisted hits remain',
  () => {
    const offenders = runGrep(CLASS_A_PATTERN, SCANNED_PATHS, [
      // 'equivalent mutant' / 'EQUIVALENT-MUTANT' / 'mutant unreachable': kept dogfood
      // comments documenting why specific lines survive mutation analysis — intentional
      // evidence in engine/src/**; a mutant-name comment outside this pattern still fails.
      /equivalent mutant|EQUIVALENT-MUTANT|mutant unreachable/,
      // docs/contributing/specs/pi-poc-record.md: frozen PoC record — filesystem-mutation
      // sense ("Pi's mutations confined to throwaway"), not a technique-name leak.
      /\/docs\/contributing\/specs\/pi-poc-record\.md:/,
    ]);
    assert.strictEqual(
      offenders.length,
      0,
      `Source-hygiene FAIL — un-allowlisted class-A hits:\n${offenders.join('\n')}`,
    );
  },
);

test(
  'Given Parts 1-10 removed VCS-host CLI references, when class-B tokens are grepped across the scanned set, then zero un-allowlisted hits remain',
  () => {
    const offenders = runGrep(CLASS_B_PATTERN, SCANNED_PATHS, [
      // docs/contributing/specs/vcs.md: content-scoped exemption — only the adapter
      // binding lines ("git and gh CLI called directly", "same git/gh CLI called directly
      // by the adapter") carry the binding marker "CLI called directly"; that is the
      // reviewed boundary where the host CLI is allowed to live. A future 'gh' in vcs.md
      // PROSE (outside a "CLI called directly" binding line) is NOT exempt and trips this gate.
      /\/docs\/contributing\/specs\/vcs\.md:[0-9]+:.*CLI called directly/,
      // docs/contributing/specs/backlog.md: the Backlog port adapter recipe documents 'gh'
      // as an example custom-script tool — an allowed host-CLI location (Backlog axis,
      // not VCS axis).
      /\/docs\/contributing\/specs\/backlog\.md:/,
      // engine/src/manifest.js 'github-issues': the NON_BUILTIN_TRACKERS constant
      // names the backlog tracker id — a tracker name, not a VCS-host CLI reference.
      /engine\/src\/manifest\.js:[0-9]+:.*github-issues/,
      // docs/guides/customizing.md 'file / gh /': the Backlog-axis label in the
      // hexagon diagram — explicitly kept (Backlog port, out of scope per Part 9
      // plan note); the regex is deliberately line-agnostic.
      /docs\/guides\/customizing\.md:[0-9]+:.*file \/ gh \//,
      // engine/src/observability/adapters/copilot/telemetry.js: the OTel
      // instrumentation-scope name is the protocol-level discriminator that
      // separates span records from metric records — a vendor identifier at
      // the vendor binding's own home, not a host-CLI call.
      /engine\/src\/observability\/adapters\/copilot\/telemetry\.js:[0-9]+:.*github\.copilot/,
      // docs/contributing/specs/telemetry.md: the OTel instrumentation-scope name is the
      // protocol discriminator the copilot binding matches on — a vendor identifier
      // documented at the telemetry port, not a host-CLI reference.
      /\/docs\/contributing\/specs\/telemetry\.md:[0-9]+:.*github\.copilot/,
      readmeCanonicalUrlOnlyFilter,
    ]);
    assert.strictEqual(
      offenders.length,
      0,
      `Source-hygiene FAIL — un-allowlisted class-B hits:\n${offenders.join('\n')}`,
    );
  },
);

test(
  'Given a README line carrying both the canonical URL and a bare host-CLI token, when the URL-only filter judges it, then the line is NOT allowlisted',
  () => {
    const sut = readmeCanonicalUrlOnlyFilter;

    const urlOnlyLine = `${path.join(ROOT, 'README.md')}:70:claude plugin marketplace add https://github.com/scolladon/craft`;
    const coLocatedLine = `${path.join(ROOT, 'README.md')}:70:run \`gh pr create\` — docs at github.com/scolladon/craft`;

    assert.strictEqual(sut.test(urlOnlyLine), true, 'pure canonical-URL line must be excused');
    assert.strictEqual(sut.test(coLocatedLine), false, 'a co-located host-CLI token must still trip the gate');
  },
);

test(
  'Given a vendor-suffixed source file outside adapters/<vendor>/, when class-C scans the vendor-binding location, then it is flagged, and the real scanned set has none',
  () => {
    const syntheticOffenders = findMisplacedVendorFiles([
      'engine/src/foo-claude.js',
      // vendor-suffixed but correctly placed: exercises the adapters/<vendor>/ exemption
      'engine/src/observability/adapters/claude/foo-claude.js',
      'engine/src/observability/adapters/claude/telemetry.js',
      'engine/src/observability/adapters/claude/metrics-split.js',
    ]);
    assert.deepStrictEqual(
      syntheticOffenders,
      ['engine/src/foo-claude.js'],
      'Source-hygiene class-C detector failed to flag a vendor-named file outside adapters/<vendor>/ (or wrongly flagged a correctly-placed one)',
    );

    const tracked = listTrackedFiles(SCANNED_PATHS);
    const offenders = findMisplacedVendorFiles(tracked);
    assert.strictEqual(
      offenders.length,
      0,
      `Source-hygiene FAIL — un-allowlisted class-C hits:\n${offenders.join('\n')}`,
    );

    // The suffix rule alone is vacuous on a tree whose bindings use neutral
    // basenames — pin the location invariant for the known vendor bindings so
    // relocating one back into the neutral core fails this gate loudly.
    const KNOWN_VENDOR_BINDINGS = [
      'engine/src/observability/adapters/claude/telemetry.js',
      'engine/src/observability/adapters/claude/pricing.js',
      'engine/src/observability/adapters/claude/metrics-split.js',
    ];
    for (const binding of KNOWN_VENDOR_BINDINGS) {
      assert.ok(
        tracked.includes(binding),
        `Source-hygiene FAIL — vendor binding not at its adapters/<vendor>/ home: ${binding}`,
      );
    }
  },
);

const SYNTHETIC_HOME = 'synthetic';
const LEAK_SHAPED_LINES = [
  `cd /Users/${SYNTHETIC_HOME}/w && x`,
  `\`/Users/${SYNTHETIC_HOME}\``,
  `/home/${SYNTHETIC_HOME}/x`,
  `"cwd":"/Users/${SYNTHETIC_HOME}/p"`,
  `WT=/Users/${SYNTHETIC_HOME}/w`,
  `'/Users/${SYNTHETIC_HOME}/w'`,
  `(/Users/${SYNTHETIC_HOME})`,
  `key:/Users/${SYNTHETIC_HOME}`,
  `[/Users/${SYNTHETIC_HOME}]`,
  `{/Users/${SYNTHETIC_HOME}}`,
  `a,/Users/${SYNTHETIC_HOME}`,
  `>/Users/${SYNTHETIC_HOME}`,
  `a;/Users/${SYNTHETIC_HOME}`,
  `a|/home/${SYNTHETIC_HOME}`,
  `a&&/Users/${SYNTHETIC_HOME}`,
  `**/Users/${SYNTHETIC_HOME}/x**`,
  `file:///Users/${SYNTHETIC_HOME}/x`,
  `/mnt/c/Users/${SYNTHETIC_HOME}/craft`,
  `/var/home/${SYNTHETIC_HOME}/craft`,
  `/System/Volumes/Data/Users/${SYNTHETIC_HOME}/x`,
  `/users/${SYNTHETIC_HOME}/x`,
  `projects/-Users-${SYNTHETIC_HOME}-craft`,
  `\`~/.claude/projects/-home-${SYNTHETIC_HOME}-craft\``,
  `~/.claude/projects/-Users-${SYNTHETIC_HOME}/abc.jsonl`,
  `C--Users-${SYNTHETIC_HOME}-workspace-craft`,
  `"dir":"-Users-${SYNTHETIC_HOME}-craft"`,
  `projects/-users-${SYNTHETIC_HOME}-craft`,
  `+/Users/${SYNTHETIC_HOME}/x`,
  `-/Users/${SYNTHETIC_HOME}/x`,
  `!/Users/${SYNTHETIC_HOME}/x`,
  `@/Users/${SYNTHETIC_HOME}/x`,
  `#/Users/${SYNTHETIC_HOME}/x`,
  `/Volumes/Macintosh HD/Users/${SYNTHETIC_HOME}/x`,
  `/private/var/home/${SYNTHETIC_HOME}/x`,
  `/run/host/home/${SYNTHETIC_HOME}/x`,
];
const HARMLESS_LINES = [
  '/Users/<name>/x',
  '-Users-<name>-craft',
  '/Users/alice/p',
  '/private/tmp/e-abc/home/cwd/g.sh',
  '/private/tmp/e-…/home/cwd/g.sh',
  '/fake/home/user',
  'adr/241-copilot-adapter-home-dist.md',
  '~/.claude/projects',
  '$HOME/.claude',
  `github.com/${SYNTHETIC_HOME}/craft`,
  '-Users-x-craft',
  '/home/user',
  '  --home-dir /tmp/h',
  'node bin/x.js --users-file a.json',
  '.nav--home-page {',
  'https://example.com/users/42',
];

for (const line of LEAK_SHAPED_LINES) {
  test(`Given the leak-shaped line ${line}, when findHomePathLeaks judges it, then a leak is flagged`, () => {
    const sut = findHomePathLeaks;

    const result = sut(line);

    assert.ok(result.length > 0);
  });

  test(`Given the leak-shaped line ${line}, when the git grep prefilter is applied, then it is a candidate`, () => {
    const sut = new RegExp(HOME_CANDIDATE_PATTERN, 'i');

    const result = sut.test(line);

    assert.ok(result);
  });
}

for (const line of HARMLESS_LINES) {
  test(`Given the harmless line ${line}, when findHomePathLeaks judges it, then nothing is flagged`, () => {
    const sut = findHomePathLeaks;

    const result = sut(line);

    assert.deepStrictEqual(result, []);
  });
}

test('Given git grep rows holding a leak, a placeholder and a CRLF leak, when listHomePathLeakLocations judges them, then only the leaks are located', () => {
  const sut = listHomePathLeakLocations;
  const candidates = [
    `docs/a.md:3:cd /Users/${SYNTHETIC_HOME}/w`,
    'docs/a.md:4:/Users/<name>/x',
    `docs/a.md:5:cd /Users/${SYNTHETIC_HOME}/w\r`,
  ];

  const result = sut(candidates);

  assert.deepStrictEqual(result, ['docs/a.md:3', 'docs/a.md:5']);
});

test('Given a git grep row with no file:line prefix, when listHomePathLeakLocations judges it, then it throws instead of skipping the row', () => {
  const sut = listHomePathLeakLocations;
  const candidates = [`cd /Users/${SYNTHETIC_HOME}/w`];

  const result = () => sut(candidates);

  assert.throws(result, /unparsable git grep row/);
});

test('Given a git repo tracking a lower-case home path and a NUL-bearing leak, when listHomePathCandidateLines scans it, then both are candidates', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'class-d-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    fs.writeFileSync(path.join(repo, 'lower.md'), `cd /users/${SYNTHETIC_HOME}/w\n`);
    fs.writeFileSync(path.join(repo, 'nul.jsonl'), `a\0b\ncd /Users/${SYNTHETIC_HOME}/w\n`);
    execFileSync('git', ['add', '.'], { cwd: repo });
    const sut = listHomePathCandidateLines;

    const result = sut(repo);

    assert.deepStrictEqual(listHomePathLeakLocations(result).sort(), ['lower.md:1', 'nul.jsonl:2']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('Given the tracked tree, when every home-rooted candidate line is judged, then zero leaks remain', () => {
  const candidates = listHomePathCandidateLines(ROOT);
  const sut = listHomePathLeakLocations;

  const result = sut(candidates);

  assert.ok(candidates.length > 0, 'git grep found no candidate line: the scan itself is broken');
  assert.deepStrictEqual(
    result,
    [],
    `Source-hygiene FAIL — home-rooted paths (class D) at:\n${result.join('\n')}`,
  );
});
