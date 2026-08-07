'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Boundary rules over the observability import graph, expressed as plain
 * source-text scans (idiom: test/source-hygiene.test.js) rather than a
 * dependency-analysis tool — the repo carries none. Each rule is a pure
 * detector over a { file → resolved specifiers } map, so a synthetic
 * offender and the real tracked tree share one code path (two-sided
 * pinning): a rule that can only ever report "clean" rots into vacuity the
 * moment the tree it polices moves.
 */

const ROOT = path.join(__dirname, '..');
const SCAN_ROOT = 'engine/src/observability';
const PURE_CORE_FILE = 'engine/src/observability/usage-aggregate.js';
const COMPOSITION_ROOT_FILE = 'engine/src/observability/usage-mine-main.js';
const MIN_DISTINCT_ADAPTER_TELEMETRY_FILES = 2;

const ADAPTER_TELEMETRY_FILE_PATTERN = /adapters\/([^/]+)\/telemetry\.js$/;

function listTrackedFiles() {
  const result = execFileSync('git', ['ls-files', '--', SCAN_ROOT], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.split('\n').filter((line) => line.endsWith('.js'));
}

// Three sibling patterns cover the specifier forms a `from`-only regex
// misses: a statement clause (`from '…'`/`from "…"`, either quote style, not
// statement-anchored — a multi-line import clause, e.g. a destructured
// node:fs import, places `from '…'` several lines below the `import`
// keyword, so anchoring to a statement start would miss it), a side-effect
// import carrying no `from` token at all (`import '…'`), and a dynamic
// import (`import('…')`). If any of these ever picks up a match inside a
// comment or a string and manufactures a false offender, tighten it to
// require statement position — never relax a rule to make that go away.
const FROM_CLAUSE_PATTERN = /from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_PATTERN = /import\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractSpecifiers(sourceText) {
  return [FROM_CLAUSE_PATTERN, SIDE_EFFECT_IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]
    .flatMap((pattern) => [...sourceText.matchAll(pattern)])
    .map((match) => match[1]);
}

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null; // bare specifier (node:*, js-yaml, …) — not repo-internal
  }
  return path.posix.join(path.posix.dirname(fromFile), specifier);
}

// Shared by the real-tree scan and by synthetic-offender tests below, so
// both exercise the identical specifier→resolved-path code path (two-sided
// pinning).
function importsFromSource(fromFile, sourceText) {
  return extractSpecifiers(sourceText)
    .map((specifier) => resolveSpecifier(fromFile, specifier))
    .filter((resolved) => resolved !== null);
}

function buildImportGraph(filePaths) {
  const graph = {};
  for (const filePath of filePaths) {
    const sourceText = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
    graph[filePath] = importsFromSource(filePath, sourceText);
  }
  return graph;
}

// The real tree cannot change mid-run (tracked source is fixed for the
// suite's duration), so caching the scan across R1/R2/R3's three calls
// carries no staleness hazard — it only removes redundant `git ls-files`
// spawns and read+regex passes over the same files.
let cachedRealGraph;

function realImportGraph() {
  cachedRealGraph ??= buildImportGraph(listTrackedFiles());
  return cachedRealGraph;
}

const ADAPTER_SEGMENT_PATTERN = /engine\/src\/observability\/adapters\/([^/]+)\//;

function adapterVendor(filePath) {
  const match = ADAPTER_SEGMENT_PATTERN.exec(filePath);
  return match ? match[1] : null;
}

// Shared primitive: every edge in the graph whose target lives under an
// adapters/<vendor>/ segment, annotated with that vendor. R1-R3 differ only
// in which (from, vendor) combination each calls an offender.
function adapterTargetEdges(graph) {
  const edges = [];
  for (const [from, tos] of Object.entries(graph)) {
    for (const to of tos) {
      const vendor = adapterVendor(to);
      if (vendor) {
        edges.push({ from, to, vendor });
      }
    }
  }
  return edges;
}

function isExcused(edge, allowlist) {
  return allowlist.some((entry) => entry.from === edge.from && entry.to === edge.to);
}

// Deliberate cross-layer exceptions, each entry carrying its own one-line
// why. Empty on the real tree today — pinned live by a synthetic-offender
// test below so an unused allowlist doesn't rot into dead code.
const ALLOWED_CROSS_LAYER_EDGES = [];

// R1 — the pure aggregate core stays adapter-agnostic: its header already
// declares "no clock, no random, no model-id literals, no runtime paths";
// this enforces the same boundary for imports.
function detectPureCoreImportsAdapter(graph, allowlist = ALLOWED_CROSS_LAYER_EDGES) {
  return adapterTargetEdges(graph)
    .filter((edge) => edge.from === PURE_CORE_FILE)
    .filter((edge) => !isExcused(edge, allowlist));
}

// R2 — adapters stay siblings, not a mesh: a vendor binding may reach its
// own files but never reach across into another vendor's.
function detectCrossAdapterImport(graph, allowlist = ALLOWED_CROSS_LAYER_EDGES) {
  return adapterTargetEdges(graph)
    .filter((edge) => {
      const fromVendor = adapterVendor(edge.from);
      return fromVendor !== null && fromVendor !== edge.vendor;
    })
    .filter((edge) => !isExcused(edge, allowlist));
}

// R3 — vendor bindings are wired up in exactly one place: the declared
// composition root (COMPOSITION_ROOT_FILE), excused by exact file identity
// — not by a `-main.js` naming convention, so a same-named look-alike still
// gets flagged. Edges originating inside an adapter segment are R2's
// jurisdiction, not this rule's — this rule only polices the neutral core
// reaching into adapters/**.
function detectNonRootImportsAdapter(graph, allowlist = ALLOWED_CROSS_LAYER_EDGES) {
  return adapterTargetEdges(graph)
    .filter((edge) => adapterVendor(edge.from) === null)
    .filter((edge) => edge.from !== COMPOSITION_ROOT_FILE)
    .filter((edge) => !isExcused(edge, allowlist));
}

test(
  'Given the observability scan root, when tracked files are listed, then the set is non-empty and includes the named anchors',
  () => {
    const tracked = listTrackedFiles();

    assert.ok(tracked.length > 0, 'expected at least one tracked .js file under the observability scan root');
    assert.ok(tracked.includes(PURE_CORE_FILE), `expected the tracked set to include ${PURE_CORE_FILE}`);
    assert.ok(tracked.includes(COMPOSITION_ROOT_FILE), `expected the tracked set to include ${COMPOSITION_ROOT_FILE}`);

    const adapterVendorsWithTelemetry = new Set(
      tracked
        .map((file) => ADAPTER_TELEMETRY_FILE_PATTERN.exec(file))
        .filter(Boolean)
        .map((match) => match[1]),
    );
    assert.ok(
      adapterVendorsWithTelemetry.size >= MIN_DISTINCT_ADAPTER_TELEMETRY_FILES,
      `expected at least ${MIN_DISTINCT_ADAPTER_TELEMETRY_FILES} distinct adapter telemetry.js files, found ${adapterVendorsWithTelemetry.size}`,
    );
  },
);

test(
  'Given the pure aggregate core, when it imports an adapter module, then R1 flags it, and the real tree has zero such offenders',
  () => {
    const syntheticGraph = {
      [PURE_CORE_FILE]: ['engine/src/observability/adapters/claude/telemetry.js'],
    };

    const syntheticOffenders = detectPureCoreImportsAdapter(syntheticGraph);
    assert.strictEqual(syntheticOffenders.length, 1, 'expected the synthetic pure-core-imports-adapter edge to be flagged');

    const realOffenders = detectPureCoreImportsAdapter(realImportGraph());
    assert.deepStrictEqual(realOffenders, [], `R1 FAIL — pure core imports an adapter:\n${JSON.stringify(realOffenders)}`);
  },
);

test(
  'Given one adapter module, when it imports a different adapter, then R2 flags it, intra-adapter imports are excused, and the real tree has zero such offenders',
  () => {
    const crossAdapterGraph = {
      'engine/src/observability/adapters/pi/telemetry.js': ['engine/src/observability/adapters/claude/telemetry.js'],
    };
    const intraAdapterGraph = {
      'engine/src/observability/adapters/claude/metrics-split.js': ['engine/src/observability/adapters/claude/telemetry.js'],
    };

    assert.strictEqual(detectCrossAdapterImport(crossAdapterGraph).length, 1, 'expected the cross-adapter edge to be flagged');
    assert.deepStrictEqual(detectCrossAdapterImport(intraAdapterGraph), [], 'expected the intra-adapter edge to be excused');

    const realOffenders = detectCrossAdapterImport(realImportGraph());
    assert.deepStrictEqual(realOffenders, [], `R2 FAIL — a module imports a sibling adapter:\n${JSON.stringify(realOffenders)}`);
  },
);

test(
  'Given a double-quoted from-clause reaching a sibling adapter, when the source is parsed into an import graph and R2 runs, then the offender is flagged',
  () => {
    const from = 'engine/src/observability/adapters/pi/telemetry.js';
    const sourceText = `import { x } from "../claude/telemetry.js";\n`;
    const graph = { [from]: importsFromSource(from, sourceText) };

    const offenders = detectCrossAdapterImport(graph);

    assert.strictEqual(offenders.length, 1, 'expected the double-quoted specifier to resolve into a flagged edge');
  },
);

test(
  'Given a dynamic import() reaching a sibling adapter, when the source is parsed into an import graph and R2 runs, then the offender is flagged',
  () => {
    const from = 'engine/src/observability/adapters/pi/telemetry.js';
    const sourceText = `async function load() {\n  await import('../claude/telemetry.js');\n}\n`;
    const graph = { [from]: importsFromSource(from, sourceText) };

    const offenders = detectCrossAdapterImport(graph);

    assert.strictEqual(offenders.length, 1, 'expected the dynamic import() specifier to resolve into a flagged edge');
  },
);

test(
  'Given a side-effect import reaching a sibling adapter, when the source is parsed into an import graph and R2 runs, then the offender is flagged',
  () => {
    const from = 'engine/src/observability/adapters/pi/telemetry.js';
    const sourceText = `import '../claude/telemetry.js';\n`;
    const graph = { [from]: importsFromSource(from, sourceText) };

    const offenders = detectCrossAdapterImport(graph);

    assert.strictEqual(offenders.length, 1, 'expected the side-effect import specifier to resolve into a flagged edge');
  },
);

test(
  'Given a non-root module, when it imports an adapter module, then R3 flags it, the composition root is excused, and the real tree has zero such offenders',
  () => {
    const nonRootGraph = {
      [PURE_CORE_FILE]: ['engine/src/observability/adapters/pi/telemetry.js'],
    };
    const rootGraph = {
      [COMPOSITION_ROOT_FILE]: ['engine/src/observability/adapters/pi/telemetry.js'],
    };

    assert.strictEqual(detectNonRootImportsAdapter(nonRootGraph).length, 1, 'expected the non-root import to be flagged');
    assert.deepStrictEqual(detectNonRootImportsAdapter(rootGraph), [], 'expected the composition root import to be excused');

    const realOffenders = detectNonRootImportsAdapter(realImportGraph());
    assert.deepStrictEqual(realOffenders, [], `R3 FAIL — a non-root module imports an adapter directly:\n${JSON.stringify(realOffenders)}`);
  },
);

test(
  'Given a file that merely matches the "-main.js" naming convention but is not the declared composition root, when it imports an adapter, then R3 still flags it',
  () => {
    const rogueMainGraph = {
      'engine/src/observability/rogue-main.js': ['engine/src/observability/adapters/pi/telemetry.js'],
    };

    const offenders = detectNonRootImportsAdapter(rogueMainGraph);

    assert.strictEqual(offenders.length, 1, 'expected a "-main.js" look-alike that is not COMPOSITION_ROOT_FILE to be flagged');
  },
);

test(
  'Given a synthetic offender with a matching allowlist entry, when a detector runs, then the edge is excused',
  () => {
    const from = 'engine/src/observability/adapters/pi/telemetry.js';
    const to = 'engine/src/observability/adapters/claude/telemetry.js';
    const graph = { [from]: [to] };
    const allowlist = [{ from, to, why: 'synthetic pin — proves the allowlist path is live, not dead code' }];

    const result = detectCrossAdapterImport(graph, allowlist);

    assert.deepStrictEqual(result, []);
  },
);
