// Patterns that make a git diff/show invocation exempt from the ext-diff check.
export const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// A global-option value: a run of quoted spans and non-whitespace chars. Mixing them
// (not just a leading quote) lets a value like `core.pager='a | b'` — quote mid-value —
// hold a space or a shell metachar inside the quotes without breaking detection.
const OPTION_VALUE = String.raw`(?:'[^']*'|"[^"]*"|[^\s'"])+`;

// Matches a git diff/show invocation anchored at a SEGMENT start, allowing leading
// whitespace (so a leading space/tab cannot slip a real invocation past) and interposed
// global options (-C, -c, --git-dir=, --work-tree=) whose values may be quoted. The
// trailing (\s|$) keeps `git show-ref`, `git stash show`, and `git difftool` out.
export const GIT_DIFF_SHOW_RE = new RegExp(
  String.raw`^\s*git(\s+(-C\s+${OPTION_VALUE}|-c\s+${OPTION_VALUE}|--git-dir=${OPTION_VALUE}|--work-tree=${OPTION_VALUE}))*\s+(diff|show)(\s|$)`,
);

// Internal to this module (the predicate below returns it); no external consumer
// re-exports it — the opencode surface deliberately keeps it private too.
const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

// Shell separators that break a command line into independently-judged segments:
// `;` `|` `&` and newline. Judging each segment on its own stops a compliant first
// invocation from exempting a non-compliant later one, and catches a `git diff` on a
// second line. Command substitution (`$(…)`, backticks) is NOT split — a git diff/show
// nested inside one is a documented residual (fails toward output-mangling, not RCE).
const SEGMENT_SEPARATORS = new Set(['\n', ';', '|', '&']);

/**
 * Split on separators that sit OUTSIDE quotes, so a `;`/`|`/`&`/newline inside a quoted
 * argument (a path, a pager string) never fragments one command into several segments.
 * @param {string} command
 * @returns {string[]}
 */
function splitSegments(command) {
  // equivalent mutant (ArrayDeclaration seeded with a sentinel): a leading non-git element is
  // skipped by GIT_DIFF_SHOW_RE (anchored at the segment's own git start), so it can never match
  // a diff/show and changes no verdict for any input.
  const segments = [];
  let current = '';
  let quote = null; // "'" or '"' while inside a quoted run

  for (const ch of command) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (SEGMENT_SEPARATORS.has(ch)) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments;
}

// Only a `#` that begins a token starts a shell comment; a `#` inside a value (a `#hex`
// colour, a URL fragment) is not a comment, so a marker to its right still counts. A
// marker hidden in a genuine trailing comment must NOT exempt the command, so strip it.
function segmentIsCompliant(segment) {
  // equivalent mutant (Regex "^|" drop / "$" drop; StringLiteral "$1" → ""): this runs only
  // AFTER GIT_DIFF_SHOW_RE matched, so the segment always starts with optional whitespace then
  // git — a "#" can never sit at position 0, so the "^" alternative is dead; "." already runs to
  // a newline-free segment's end, so "$" is redundant; and the captured group is then always a
  // whitespace char whose removal cannot change a fixed-substring marker match.
  const withoutComment = segment.replace(/(^|\s)#.*$/, '$1');
  return COMPLIANT_MARKERS.some((marker) => withoutComment.includes(marker));
}

/**
 * Pure predicate: does this bash command run git diff/show without --no-ext-diff?
 *
 * Each quote-aware, shell-separated segment is judged independently, so a compliant
 * invocation never exempts a non-compliant sibling, and a marker hidden in a comment or
 * an unrelated word cannot disarm the guard. The first non-compliant git diff/show
 * segment blocks.
 *
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitExtDiffPredicate(command) {
  for (const segment of splitSegments(command)) {
    if (!GIT_DIFF_SHOW_RE.test(segment)) {
      continue;
    }
    if (segmentIsCompliant(segment)) {
      continue;
    }
    return { block: true, reason: REASON_GIT_EXT_DIFF };
  }

  return { block: false };
}
