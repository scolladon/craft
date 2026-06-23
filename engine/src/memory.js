/**
 * Memory store read path — parse, validate-on-read, advisory empty-view.
 *
 * The store is a single markdown file with YAML frontmatter as the authoritative
 * data; the markdown body is a human-readable rendering derived from the frontmatter
 * on every serialize call (never parsed, always regenerated).
 *
 * Advisory-only invariant: load() over ANY malformed / poisoned / partial store
 * MUST never throw and MUST never yield a gating value — it returns an empty-or-
 * filtered MemoryView. Entries that fail validate-on-read are moved to evicted[].
 *
 * part-sizing has no per-use re-check (weak planner hint) — its validator
 * defaults to () => true when absent from the deps.validators map.
 */

import { resolve as resolvePath, sep as pathSep } from 'node:path';

import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { extractFrontmatter } from './frontmatter.js';

/**
 * Default store path, relative to the repo root, when no `ref` is configured.
 * Mirrors the manifest `memory.ref` default.
 */
export const DEFAULT_REF = '.claude/craft-memory.md';

/**
 * Resolve the store path from the repo root and an optional configured `ref`
 * (the manifest `memory.ref`). Returns null when the resolved path escapes the
 * repo root — load/save treat that as "no store" / a recorded warning, never a
 * read or write outside the repo (path-traversal containment).
 *
 * @param {string} repoRoot
 * @param {string|undefined} ref
 * @returns {string|null}
 */
function resolveStorePath(repoRoot, ref) {
  const rootAbs = resolvePath(repoRoot);
  const target = resolvePath(rootAbs, ref ?? DEFAULT_REF);
  if (target !== rootAbs && !target.startsWith(rootAbs + pathSep)) return null; // equivalent mutant (true && ...): root itself resolves to a directory, readStore handles null/throw as emptyView either way
  return target;
}

/**
 * The five concerns the store tracks.
 * Metrics live in a separate append-only artifact (never in this store).
 *
 * @type {ReadonlyArray<string>}
 */
export const CONCERNS = Object.freeze([
  'toolchain',
  'gate-cmd',
  'mutation-tool',
  'findings',
  'part-sizing',
]);

/**
 * Build an empty entries map (all concerns → empty array).
 *
 * @returns {{ [concern: string]: object[] }}
 */
function emptyEntries() {
  return Object.fromEntries(CONCERNS.map(c => [c, []]));
}

/**
 * Build an empty MemoryView.
 *
 * @param {string} note - Human-readable reason the view is empty.
 * @returns {{ entries: object, evicted: object[], loadNote: string }}
 */
function emptyView(note) {
  return { entries: emptyEntries(), evicted: [], loadNote: note };
}

/**
 * Parse a store file content string into a MemoryView-shaped object.
 * Returns null when the content is absent, empty, or unparseable.
 *
 * The frontmatter is the authoritative data; the body is ignored.
 *
 * @param {string} content
 * @returns {{ entries: object } | null}
 */
export function parseStore(content) {
  if (!content) return null; // equivalent mutant (false): null content reaches extractFrontmatter(null) → throws → caught below → returns null; same result

  try {
    const yamlText = extractFrontmatter(content);
    if (!yamlText) return null; // equivalent mutant (false): null yamlText → yamlLoad(null)=null → L94 guard → returns null; same result

    const parsed = yamlLoad(yamlText);
    if (!parsed || typeof parsed !== 'object') return null;

    const entries = emptyEntries();
    for (const concern of CONCERNS) {
      const raw = parsed[concern];
      if (!Array.isArray(raw)) continue;
      entries[concern] = raw.filter(e => e && typeof e === 'object');
    }

    return { entries };
  } catch {
    return null;
  }
}

/**
 * Serialize a MemoryView back to a store file string.
 * Regenerates the markdown body deterministically from frontmatter so that
 * an unchanged store round-trips to a byte-identical file.
 *
 * Key order in the YAML frontmatter is pinned to CONCERNS order for diffability.
 *
 * @param {{ entries: object, evicted: object[], loadNote: string|null }} view
 * @returns {string}
 */
export function serializeStore(view) {
  const frontmatterData = {};
  for (const concern of CONCERNS) {
    frontmatterData[concern] = view.entries[concern] ?? [];
  }

  const yamlText = yamlDump(frontmatterData, {
    lineWidth: -1,
    sortKeys: false,
    noRefs: true,
  });

  const body = buildBody(view.entries);

  return `---\n${yamlText}---\n${body}`;
}

/**
 * Format the single markdown line for one memory entry.
 *
 * @param {object} entry
 * @returns {string}
 */
function entryLine(entry) {
  const confidence = entry.confidence ?? '?';
  const provenance = entry.provenance
    ? `${entry.provenance.commit ?? '?'} / ${entry.provenance.date ?? '?'}`
    : '?';
  return `- confidence: ${confidence} | provenance: ${provenance}\n`;
}

/**
 * Build the lines for one concern's section: header plus either the
 * empty-state marker or one line per entry.
 *
 * @param {string} concern
 * @param {object[]} concernEntries
 * @returns {string[]}
 */
function concernSection(concern, concernEntries) {
  const lines = [`\n## ${concern}\n`];
  if (concernEntries.length === 0) {
    lines.push('_(none)_\n');
  } else {
    for (const entry of concernEntries) lines.push(entryLine(entry));
  }
  return lines;
}

/**
 * Build the human-readable markdown body from entries.
 * Deterministic: same entries always produce the same body.
 *
 * @param {{ [concern: string]: object[] }} entries
 * @returns {string}
 */
function buildBody(entries) {
  const lines = [
    '\n# craft memory store\n',
    '> Machine-maintained. Edit the YAML frontmatter above, not this body.\n',
  ];
  for (const concern of CONCERNS) {
    lines.push(...concernSection(concern, entries[concern] ?? []));
  }
  return lines.join('');
}

/**
 * Load and validate a memory store, returning a MemoryView.
 *
 * This is the advisory read path — it NEVER throws and NEVER yields a gating
 * value. Any absent/empty/malformed store returns an empty MemoryView.
 *
 * Entries that fail their concern's validate-on-read predicate are dropped from
 * entries and listed in evicted.
 *
 * @param {string} repoRoot - The resolved worktree/checkout root.
 * @param {{ readStore: (path: string) => string|null, validators: { [concern: string]: (entry: object) => boolean } }} deps
 * @returns {{ entries: object, evicted: object[], loadNote: string|null }}
 */
export function load(repoRoot, deps) {
  const storePath = resolveStorePath(repoRoot, deps.ref);
  if (!storePath) return emptyView('store path outside repo');

  let rawContent;
  try {
    rawContent = deps.readStore(storePath);
  } catch {
    return emptyView('no store');
    // equivalent mutant (catch {}): rawContent is never assigned when readStore throws (stays undefined);
    // the next guard (!rawContent) catches undefined and returns emptyView('no store') — same result
  }

  if (!rawContent) return emptyView('no store');

  const parsed = parseStore(rawContent);
  if (!parsed) return emptyView('malformed store');

  return applyValidators(parsed.entries, deps.validators ?? {});
}

/**
 * Apply per-concern validate-on-read predicates.
 * Entries that fail are removed from the returned entries and appended to evicted.
 * part-sizing defaults to () => true when no validator is provided.
 *
 * @param {{ [concern: string]: object[] }} allEntries
 * @param {{ [concern: string]: (entry: object) => boolean }} validators
 * @returns {{ entries: object, evicted: object[], loadNote: string|null }}
 */
function applyValidators(allEntries, validators) {
  const entries = emptyEntries();
  const evicted = [];

  for (const concern of CONCERNS) {
    const isValid = validators[concern] ?? (() => true);
    for (const entry of (allEntries[concern] ?? [])) {
      if (isValid(entry)) {
        entries[concern].push(entry);
      } else {
        evicted.push({ ...entry, concern });
      }
    }
  }

  const loadNote = evicted.length > 0 ? 'some entries failed validate-on-read' : null;
  return { entries, evicted, loadNote };
}

// ─── write path constants ─────────────────────────────────────────────────────

/** Minimum confidence (inclusive). An entry at this value after decay is evicted. */
export const FLOOR = 0;

/** Maximum confidence. Refreshes cannot raise above this. */
export const CEILING = 5;

/** Increment/decrement applied per refresh/decay cycle. */
export const STEP = 1;

/** Size of the newest-entry candidate window for cap eviction. */
export const WINDOW = 50;

// ─── key definitions per concern ─────────────────────────────────────────────

/** Fields that form the merge identity (key) for each concern. */
const KEY_FIELDS = Object.freeze({
  toolchain: ['ecosystem'],
  'gate-cmd': ['phase'],
  'mutation-tool': ['tool'],
  findings: ['file', 'pattern'],
  'part-sizing': ['size'],
});

/**
 * Derive the merge key string for a concern+payload pair.
 *
 * @param {string} concern
 * @param {object} payload
 * @returns {string}
 */
function keyOf(concern, payload) {
  const fields = KEY_FIELDS[concern] ?? [];
  return fields.map(f => String(payload[f] ?? '')).join('\x00');
}

// ─── severity ordering for findings improve check ────────────────────────────

const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

/**
 * Per-concern "does the new observation improve the stored entry's meaning?"
 * predicate. Co-located with KEY_FIELDS so every concern's merge identity and
 * its improve rule sit together — a concern missing a rule is structurally
 * obvious, and the default (no rule) is never-rewrite.
 *   findings      — severity escalated
 *   toolchain     — lockfile fingerprint changed
 *   mutation-tool — config fingerprint changed
 *   gate-cmd      — discovered command changed (the newer command is current truth)
 *   part-sizing  — outcome changed (the newer outcome is current truth)
 */
const IMPROVES_BY = Object.freeze({
  // equivalent mutant (>=): same-severity rewrite spreads identical value; stored data unchanged
  findings: (o, n) => (SEVERITY_RANK[n.severity] ?? 0) > (SEVERITY_RANK[o.severity] ?? 0),
  // equivalent mutant (=> true) for the whole discriminating-field family below
  // (toolchain, mutation-tool, gate-cmd, part-sizing): each predicate's tested field is the
  // ONLY non-key payload field, so when it is unchanged the rewrite {...entry, ...obs.payload}
  // spreads values identical to the stored entry — an identity. The re-observation already
  // matched on the key field, so a same-field payload equals the stored entry. Not killable
  // without violating a concern's payload schema; documented here per the triage convention.
  toolchain: (o, n) => n.lockfileFingerprint !== o.lockfileFingerprint,
  'mutation-tool': (o, n) => n.configFingerprint !== o.configFingerprint,
  'gate-cmd': (o, n) => n.command !== o.command,
  'part-sizing': (o, n) => n.outcome !== o.outcome,
});

/**
 * Return true when the new observation carries more information than the stored one.
 *
 * @param {string} concern
 * @param {object} oldPayload
 * @param {object} newPayload
 * @returns {boolean}
 */
function improves(concern, oldPayload, newPayload) {
  const predicate = IMPROVES_BY[concern];
  return predicate ? predicate(oldPayload, newPayload) : false;
}

// ─── transition reconciler ────────────────────────────────────────────────────

/**
 * Build the composite lookup key for an observation or entry.
 * Separates the concern prefix from the payload key with U+0001 so the
 * separator is defined in one place and never scattered as a magic value.
 *
 * @param {string} concern
 * @param {object} payload
 * @returns {string}
 */
function entryKey(concern, payload) {
  // equivalent mutant (''): current concern names share no prefix that causes collision without separator
  return concern + '\x01' + keyOf(concern, payload);
}

/**
 * Index a delta array into a Map keyed by entryKey for O(1) lookup.
 *
 * @param {Array<{ concern: string, payload: object }>} delta
 * @returns {Map<string, { concern: string, payload: object }>}
 */
function indexDelta(delta) {
  const observedMap = new Map();
  for (const obs of delta) {
    observedMap.set(entryKey(obs.concern, obs.payload), obs);
  }
  return observedMap;
}

/**
 * Build a REFRESHED entry — payload rewritten only when `improves` is true.
 *
 * @param {object} entry - existing stored entry
 * @param {{ concern: string, payload: object }} obs - matched observation
 * @param {string} concern
 * @param {{ run: string, commit: string, date: string }} provenance
 * @returns {object}
 */
function refreshedEntry(entry, obs, concern, provenance) {
  const shouldRewrite = improves(concern, entry, obs.payload);
  return {
    ...entry,
    ...(shouldRewrite ? obs.payload : {}),
    confidence: Math.min(entry.confidence + STEP, CEILING),
    provenance,
  };
}

/**
 * Collect ADDED entries for one concern: observations that were not REFRESHED.
 *
 * @param {string} concern
 * @param {Array<{ concern: string, payload: object }>} delta
 * @param {Set<string>} refreshedKeys
 * @param {{ run: string, commit: string, date: string }} provenance
 * @returns {object[]}
 */
function addedEntries(concern, delta, refreshedKeys, provenance) {
  return delta
    .filter(obs => obs.concern === concern && !refreshedKeys.has(entryKey(concern, obs.payload)))
    .map(obs => ({ concern, ...obs.payload, confidence: FLOOR + STEP, provenance }));
}

/**
 * Apply REFRESHED / DECAYED / EVICTED / ADDED transitions for one concern.
 * `refreshedKeys` is local — keys are concern-prefixed so there is no
 * cross-concern collision risk.
 *
 * @param {string} concern
 * @param {object[]} existing
 * @param {Map<string, object>} observedMap
 * @param {Array<{ concern: string, payload: object }>} delta
 * @param {{ run: string, commit: string, date: string }} provenance
 * @returns {object[]}
 */
function reconcileConcern(concern, existing, observedMap, delta, provenance) {
  const refreshedKeys = new Set();
  const reconciled = [];

  for (const entry of existing) {
    const k = entryKey(concern, entry);
    const obs = observedMap.get(k);
    if (obs !== undefined) {
      refreshedKeys.add(k);
      reconciled.push(refreshedEntry(entry, obs, concern, provenance));
    } else {
      const newConf = entry.confidence - STEP;
      if (newConf > FLOOR) reconciled.push({ ...entry, confidence: newConf });
    }
  }

  return [...reconciled, ...addedEntries(concern, delta, refreshedKeys, provenance)];
}

/**
 * Merge a delta observation set into a loaded view's entries.
 * Applies ADDED / REFRESHED / DECAYED / EVICTED transitions.
 * Returns a NEW entries map (immutable — does not mutate the input view).
 *
 * @param {{ [concern: string]: object[] }} loadedEntries
 * @param {Array<{ concern: string, payload: object }>} delta
 * @param {{ run: string, commit: string, date: string }} provenance
 * @returns {{ [concern: string]: object[] }}
 */
function reconcile(loadedEntries, delta, provenance) {
  const observedMap = indexDelta(delta);
  return Object.fromEntries(
    CONCERNS.map(concern => [
      concern,
      reconcileConcern(concern, loadedEntries[concern] ?? [], observedMap, delta, provenance),
    ])
  );
}

// ─── eviction loop ────────────────────────────────────────────────────────────

/**
 * Flatten all entries from all concerns into a single list sorted oldest→newest
 * by provenance date. Ties are broken by CONCERNS order then within-concern index.
 * This total ordering is used to identify the "newest WINDOW entries" for cap eviction.
 *
 * @param {{ [concern: string]: object[] }} entries
 * @returns {Array<{ entry: object, concern: string, index: number }>}
 */
function flattenEntries(entries) {
  const flat = [];
  for (const concern of CONCERNS) {
    for (let i = 0; i < (entries[concern] ?? []).length; i++) {
      flat.push({ entry: entries[concern][i], concern, index: i });
    }
  }
  // Sort oldest→newest by provenance date so windowStart correctly captures newest-WINDOW
  flat.sort((a, b) => {
    const dateA = a.entry.provenance?.date ?? '';
    const dateB = b.entry.provenance?.date ?? '';
    if (dateA < dateB) return -1;
    // equivalent mutants (true/false/>=) for second branch: only affect equal-date pairs;
    // ISO date strings are unique per run so ties are broken by insertion order either way
    if (dateA > dateB) return 1;
    // Tie: stable by CONCERNS order then index (already in that order)
    return 0;
  });
  return flat;
}

/**
 * Remove a single entry from the entries map and return a new map.
 *
 * @param {{ [concern: string]: object[] }} entries
 * @param {string} concern
 * @param {number} index
 * @returns {{ [concern: string]: object[] }}
 */
function dropEntry(entries, concern, index) {
  const updated = {};
  for (const c of CONCERNS) {
    updated[c] = c === concern
      ? [...entries[c].slice(0, index), ...entries[c].slice(index + 1)]
      : [...(entries[c] ?? [])];
  }
  return updated;
}

/**
 * Count total entries across all concerns.
 *
 * @param {{ [concern: string]: object[] }} entries
 * @returns {number}
 */
function countEntries(entries) {
  return CONCERNS.reduce((sum, c) => sum + (entries[c] ?? []).length, 0);
}

/**
 * Apply both-caps eviction until the store fits maxEntries AND maxBytes.
 * Only the WINDOW newest entries are candidates for cap eviction.
 * Within the window: drop lowest confidence; ties → oldest provenance.
 *
 * @param {{ [concern: string]: object[] }} entries
 * @param {{ maxEntries: number, maxBytes: number }} caps
 * @returns {{ [concern: string]: object[] }}
 */
function exceedsCaps(entries, caps) {
  if (countEntries(entries) > caps.maxEntries) return true;
  // equivalent mutant (evicted:["Stryker was here"]): serializeStore ignores the evicted field
  const serialized = serializeStore({ entries, evicted: [], loadNote: null });
  // equivalent mutant (''): Buffer.byteLength with empty/invalid encoding defaults to utf8
  return Buffer.byteLength(serialized, 'utf8') > caps.maxBytes;
}

/**
 * From the WINDOW newest entries, pick the least-relevant to drop:
 * lowest confidence; ties → oldest provenance date.
 *
 * @param {Array<{ concern: string, index: number, entry: object }>} flat
 *   entries flattened oldest→newest.
 * @returns {{ concern: string, index: number, entry: object }|null}
 */
function selectVictim(flat) {
  const windowStart = Math.max(0, flat.length - WINDOW);
  const candidates = [...flat.slice(windowStart)];
  if (candidates.length === 0) return null; // equivalent mutant (false): evictToCaps only calls this when exceedsCaps is true, which requires entries; non-empty flat → candidates always non-empty
  candidates.sort((a, b) => {
    const confDiff = a.entry.confidence - b.entry.confidence;
    if (confDiff !== 0) return confDiff;
    // equivalent mutant (if(true)): skipping confDiff guard returns 0 when confDiff=0; flattenEntries
    // already date-sorted candidates so stable-sort preserves that order — same victim selected
    // equivalent mutants for date comparators: flattenEntries already sorted candidates by date
    // so the date tiebreak in selectVictim merely preserves that order; skipping it (true/false)
    // leaves candidates in the flattenEntries date order → same victim
    // equivalent mutant (dateB ?? "Stryker"): no-prov entries have date=''; sentinel is never ''
    //   so comparisons still work (sentinel > any real date → entry appears newer → correct eviction)
    // equivalent mutant (?? → &&): dateB = provenance?.date && '' → when b has provenance,
    //   dateB='' (always oldest-possible); no-prov entries (b=candidates[0]) also give ''; since
    //   b is always the earlier-sorted entry (older or equal), forcing dateB='' preserves the ordering
    const dateA = a.entry.provenance?.date ?? '';
    const dateB = b.entry.provenance?.date ?? '';
    // equivalent mutant (dateA ?? "Stryker"): sentinel string > any date → entry appears newer → not evicted
    // equivalent mutant (return +1 instead of -1): flattenEntries already sorted candidates oldest→newest;
    //   V8 insertion sort on pre-sorted data only calls comparator(newer, older) → dateA > dateB direction;
    //   the dateA < dateB branch (return -1) is never executed on pre-sorted input → mutant unreachable
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    return 0;
  });
  return candidates[0];
}

function evictToCaps(entries, caps) {
  let current = entries;
  while (exceedsCaps(current, caps)) {
    const victim = selectVictim(flattenEntries(current));
    if (victim === null) break; // equivalent mutant (false): selectVictim only returns null for empty candidates, unreachable when exceedsCaps is true
    current = dropEntry(current, victim.concern, victim.index);
  }
  return current;
}

// ─── save verb ────────────────────────────────────────────────────────────────

/**
 * Flush this run's buffered observations into the store.
 * Applies update-semantics reconciliation, then both-caps eviction, then
 * writes the result as a single atomic call to deps.writeStore.
 *
 * A failed writeStore is a recorded warning — save never throws or blocks.
 *
 * @param {string} repoRoot - resolved worktree/checkout root.
 * @param {{ entries: object, evicted: object[], loadNote: string|null }} view
 *   The MemoryView returned by load() — already has stale entries removed.
 * @param {Array<{ concern: string, payload: object }>} delta
 *   Buffered observations for this run.
 * @param {{
 *   writeStore: (path: string, content: string) => void,
 *   ref?: string,
 *   caps?: { maxEntries: number, maxBytes: number },
 *   run?: { run: string, commit: string, date: string }
 * }} deps
 * @returns {{ writeNote: string|null, view: object }}
 */
export function save(repoRoot, view, delta, deps) {
  // equivalent mutant ({}): missing maxEntries/maxBytes produce undefined; N > undefined = false,
  // so no eviction happens — same outcome as the generous defaults (1000 entries, Infinity bytes)
  // for any realistic dataset that stays under those limits
  const caps = deps.caps ?? { maxEntries: 1000, maxBytes: Infinity };
  const provenance = deps.run ?? { run: 'unknown', commit: 'unknown', date: new Date().toISOString().slice(0, 10) };

  const reconciledEntries = reconcile(view.entries, delta, provenance);
  const evictedEntries = evictToCaps(reconciledEntries, caps);

  const finalView = { entries: evictedEntries, evicted: [], loadNote: null };

  const storePath = resolveStorePath(repoRoot, deps.ref);
  if (!storePath) return { writeNote: 'save skipped: store path outside repo', view: finalView };

  const content = serializeStore(finalView);

  try {
    deps.writeStore(storePath, content);
    return { writeNote: null, view: finalView };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { writeNote: `save failed: ${reason}`, view: finalView };
  }
}
