'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
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
  path.join(ROOT, 'docs/DOD.md'),
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
