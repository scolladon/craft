/**
 * Pure phase-skip signal: detects the fixed `auto-skip: <phase>` run-record token
 * and folds per-run markers into `phase-skip` recommendations.
 *
 * The token grammar is orchestrator prose, not a transcript-schema field, so it
 * lives in the shared observability core rather than a vendor adapter. The
 * `auto-skip` reason ("didn't need to run") is the only non-run token that argues
 * for a committed skip — `WAIVER:` (operator intent) and `NO-OP(<phase>):` (ran,
 * found nothing) are deliberately not matched here.
 *
 * No I/O, no clock, no random. Output is sorted for byte-stable downstream use.
 */

// Token example: `auto-skip: <phase> — evaluated unnecessary (<signal>)`. The phase is a
// canonical lowercase id; the trailing dash and parenthetical signal are ignored.
const AUTO_SKIP_RE = /auto-skip:\s*([a-z][a-z-]*)/g;

/**
 * @param {string} text
 * @returns {string[]} canonical phase ids named by every `auto-skip:` marker, in order
 */
export function autoSkipPhasesInText(text) {
  if (typeof text !== 'string') return [];
  const phases = [];
  for (const match of text.matchAll(AUTO_SKIP_RE)) phases.push(match[1]);
  return phases;
}

/**
 * Fold `{ run, phase }` markers into one `phase-skip` rec per distinct run+phase.
 * @param {{ run: string, phase: string }[]} markers
 * @returns {object[]}
 */
export function phaseSkipRecs(markers) {
  const seen = new Set();
  const recs = [];
  for (const { run, phase } of markers) {
    const key = `${run}\x00${phase}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recs.push({
      kind: 'phase-skip',
      run,
      phase,
      model: null,
      detail: `phase ${phase} auto-skipped (evaluated unnecessary)`,
      evidence: { marker: 'auto-skip' },
    });
  }
  // The sort gives the pure function a byte-stable order for direct callers; the
  // report path re-sorts every rec centrally, so this ordering is not otherwise
  // load-bearing.
  // equivalent mutant (empty first key `${a.run}\x00${a.phase}` → ``): over distinct
  // (run, phase) keys the comparator yields the same relative order either way.
  return recs.sort((a, b) =>
    `${a.run}\x00${a.phase}`.localeCompare(`${b.run}\x00${b.phase}`)
  );
}
