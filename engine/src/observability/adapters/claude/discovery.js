/**
 * Claude transcript discovery: walks the pinned two-level projects-root shape
 * and labels each sub-agent transcript from its sidecar.
 *
 *   <root>/*.jsonl                                  main-loop transcripts
 *   <root>/<sessionId>/subagents/agent-*.jsonl      sub-agent transcripts
 *   <root>/<sessionId>/subagents/agent-*.meta.json  sidecar carrying agentType
 *
 * The walk is pinned to exactly this shape rather than a generic recursive
 * descent. A `memory/` directory already sits in the real projects root and
 * upstream may add more; a generic walk would descend into anything it finds
 * and hand the parser files whose shape it has never seen. Gating on the
 * literal `subagents` child name and the `agent-` prefix means an upstream
 * layout change breaks discovery loudly — nothing matches, nothing emits —
 * instead of degrading silently by feeding the parser the wrong bytes.
 *
 * This module performs no I/O of its own: `listDir` and `readText` are
 * injected ports, already resolved and containment-checked by the front
 * door. That keeps discovery unit-testable against fakes with zero
 * filesystem, and keeps containment un-bypassable by adapter code even in
 * principle — this module never holds a path outside the ports it receives.
 *
 * The sidecar's `agentType` is the only field taken from it; every other
 * field (`description`, `toolUseId`, `spawnDepth`, `model`) is read and
 * discarded at this boundary and never reaches a `context`, so it can never
 * leak into a report.
 */

/**
 * @typedef {{ relPath: string, context: object }} TranscriptEntry
 */

const SUBAGENTS_DIR = 'subagents';
const TRANSCRIPT_SUFFIX = '.jsonl';
const SIDECAR_SUFFIX = '.meta.json';
const SUBAGENT_PREFIX = 'agent-';
// the sidecar's agentType is untrusted upstream content — this pattern is a
// shape/length bound for report hygiene only (stock Claude Code agent types
// like `Explore` and `Plan` are capitalised, so the bound must accept them).
// It is NOT what stops a prototype-pollution key (e.g. "constructor", which
// passes this pattern cleanly) from resolving as a bogus phase or price
// entry downstream — that protection is `Object.hasOwn` at every lookup
// site (phaseFromAgentType, lookupPrices), not this pattern. A value failing
// this shape is treated identically to a missing sidecar: no label,
// counted — never a throw.
const AGENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9:_-]{0,63}$/;

/**
 * @param {{ listDir: (relPath: string) => string[] | null,
 *           readText: (relPath: string) => string | null }} ports
 *   listDir returns null when it could not list (containment refusal, ENOENT,
 *   EACCES, ENOTDIR) and [] when it listed an empty directory — collapsing
 *   both to [] would make an empty subagents/ (a normal no-op) indistinguishable
 *   from an unlistable one (a counted skip the advisory reporting needs).
 *   Both ports never throw.
 * @returns {{ entries: TranscriptEntry[], unreadable: number }}
 */
export function discover({ listDir, readText }) {
  const rootNames = listDir('');
  if (rootNames === null) return { entries: [], unreadable: 0 };

  const entries = [];
  let unreadable = 0;

  for (const name of [...rootNames].sort()) {
    if (name.endsWith(TRANSCRIPT_SUFFIX)) {
      entries.push({ relPath: name, context: { sourceKind: 'main' } });
      continue;
    }

    // A probe that comes back null is the normal negative answer for a name
    // that is not a session directory at all (a stray file, something this
    // walk has no business in) — not an anomaly, so it is never counted.
    const sessionListing = listDir(name);
    if (sessionListing === null) continue;

    // Refuses memory/ and any other non-session directory in the root BY
    // SHAPE: only a listing that names a `subagents` child is a session dir.
    if (!sessionListing.includes(SUBAGENTS_DIR)) continue;

    const subagentsPath = `${name}/${SUBAGENTS_DIR}`;
    const subagentNames = listDir(subagentsPath);
    if (subagentNames === null) {
      // The child WAS named in its parent's listing and still could not be
      // listed — an unreadable directory, or a symlink whose realpath
      // escaped the read root and was refused by containment. Surprising
      // enough to count; never followed, never partially trusted.
      unreadable += 1;
      continue;
    }

    for (const subagentName of [...subagentNames].sort()) {
      if (!subagentName.startsWith(SUBAGENT_PREFIX) || !subagentName.endsWith(TRANSCRIPT_SUFFIX)) continue;

      // derived from the two named suffix constants, not a re-hardcoded
      // literal — subagentName is already confirmed to end with TRANSCRIPT_SUFFIX
      // by the guard above.
      const sidecarName = subagentName.slice(0, -TRANSCRIPT_SUFFIX.length) + SIDECAR_SUFFIX;
      const raw = readText(`${subagentsPath}/${sidecarName}`);
      const agentType = parseAgentType(raw);

      entries.push({
        relPath: `${subagentsPath}/${subagentName}`,
        context: { sourceKind: 'subagent', agentType },
      });
    }
  }

  return { entries, unreadable };
}

// The sidecar is an undocumented upstream file: absent, unreadable,
// malformed, and present-but-no-agentType all converge on the same outcome
// here — no label — rather than throwing partway through discovery.
function parseAgentType(raw) {
  // equivalent mutant (false): JSON.parse(null) coerces to JSON.parse("null") === null
  // (verified), so `parsed.agentType` below throws on the null `parsed` and the
  // catch already returns null — same result as this early return.
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.agentType === 'string' && AGENT_TYPE_PATTERN.test(parsed.agentType)
      ? parsed.agentType
      : null;
  } catch {
    return null;
  }
}
