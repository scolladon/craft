/**
 * README drift-guard region extraction — pure string -> value, no fs/YAML here.
 * Every region is anchored on a fenced-block info-string or the FAQ heading
 * text, never a line number, so line-position shifts never move the guard.
 * The first `mermaid`/`text` fenced block is assumed to be the pipeline
 * diagram/run timeline — the README's front-matter contract, not a derived fact.
 */

const FENCE_LINE = /^```(\S*)\s*$/;
const YAML_INFO_STRING = 'yaml';
const MERMAID_INFO_STRING = 'mermaid';
const TIMELINE_INFO_STRING = 'text';
const SUBGRAPH_TOKEN = 'subgraph';

const MERMAID_LABEL = /\[([^\]]+)\]|\{\{"([^"]+)"\}\}/g;
const TRAILING_PERSON_TAG = /\s*🧑\s*$/;

const FAQ_ANCHOR = 'What does a run cost?';
const RUN_COUNT_PATTERN = /(\d+) telemetered runs/;
const MEDIAN_PATTERN = /≈([\d.]+) hours/;
const MAX_PATTERN = /to ≈(\d+) hours/;
const MIN_PHRASE = 'half an hour';

/**
 * Extract the four README drift-guard regions from a README string (or any
 * fragment containing them).
 *
 * @param {string} readme
 * @returns {{
 *   yamlBlocks: string[],
 *   mermaidPhases: string[],
 *   timelinePhases: string[],
 *   costClaims: {runCount: string|null, median: string|null, min: string|null, max: string|null},
 * }}
 */
export function extractReadmeRegions(readme) {
  return {
    yamlBlocks: extractFencedBlocks(readme, YAML_INFO_STRING),
    mermaidPhases: extractMermaidPhases(extractFencedBlocks(readme, MERMAID_INFO_STRING)[0]),
    timelinePhases: extractTimelinePhases(extractFencedBlocks(readme, TIMELINE_INFO_STRING)[0]),
    costClaims: extractCostClaims(readme),
  };
}

/**
 * Every fenced block whose opening info-string exactly matches `infoString`.
 * A block's body is the text strictly between its opening fence and the next
 * bare closing fence.
 */
function extractFencedBlocks(readme, infoString) {
  const blocks = [];
  let current = null;

  for (const line of readme.split('\n')) {
    const fence = line.match(FENCE_LINE);
    if (current === null && fence && fence[1] === infoString) {
      current = [];
      continue;
    }
    if (current !== null && fence && fence[1] === '') {
      blocks.push(current.join('\n'));
      current = null;
      continue;
    }
    if (current !== null) current.push(line);
  }

  return blocks;
}

function firstToken(line) {
  // equivalent mutant (Regex `\s+` → `\s`): split()'s first element is the substring
  // before the FIRST delimiter match, and one-or-more vs exactly-one whitespace both start
  // that match at the same character — index [0] is identical either way.
  // equivalent mutant (`?? ''` fallback, e.g. → "Stryker was here!"): String.split always
  // returns an array with at least one element (even '' splits to ['']), so [0] is never
  // nullish — the fallback is unreachable for any string input.
  return line.trim().split(/\s+/)[0] ?? '';
}

function stripPersonTag(label) {
  return label.replace(TRAILING_PERSON_TAG, '');
}

/**
 * Mermaid node labels: `[...]` (rectangle) and `{{"..."}}` (hexagon) text.
 * A `[...]` on a `subgraph` line names a group (specify/verify/ship), not a
 * phase, so it is dropped.
 */
function extractMermaidPhases(block) {
  if (!block) return [];
  const phases = [];

  for (const line of block.split('\n')) {
    const isSubgraphLine = firstToken(line) === SUBGRAPH_TOKEN;
    for (const match of line.matchAll(MERMAID_LABEL)) {
      const isBracketLabel = match[1] !== undefined;
      if (isSubgraphLine && isBracketLabel) continue;
      phases.push(stripPersonTag(match[1] ?? match[2]));
    }
  }

  return phases;
}

/**
 * Timeline phase ids: the first whitespace-delimited token of every line
 * containing a `→` arrow. The command-line intro carries no arrow, so it is
 * skipped naturally.
 */
function extractTimelinePhases(block) {
  if (!block) return [];
  return block
    .split('\n')
    .filter((line) => line.includes('→'))
    .map((line) => stripPersonTag(firstToken(line)));
}

/**
 * FAQ cost claims, anchored on the question text rather than a line number.
 * The max claim is anchored on its `to ≈N hours` range clause so it stays
 * distinct from the median even when the median is written as a whole number
 * of hours (`≈2 hours`).
 */
function extractCostClaims(readme) {
  const anchorIndex = readme.indexOf(FAQ_ANCHOR);
  // equivalent mutant (ConditionalExpression `anchorIndex === -1` → false, and StringLiteral
  // `''` → "Stryker was here!"): both mutations only change `section` on the anchor-absent
  // path, to either readme.slice(-1) (at most one character) or a fixed 18-character literal
  // with no digits, no ≈, and no 'half an hour' substring. Neither can satisfy
  // RUN_COUNT_PATTERN, MEDIAN_PATTERN, MAX_PATTERN, or the MIN_PHRASE include check, so
  // costClaims stays all-null exactly as when section === ''.
  const section = anchorIndex === -1 ? '' : readme.slice(anchorIndex);

  return {
    runCount: section.match(RUN_COUNT_PATTERN)?.[1] ?? null,
    median: section.match(MEDIAN_PATTERN)?.[1] ?? null,
    min: section.includes(MIN_PHRASE) ? MIN_PHRASE : null,
    max: section.match(MAX_PATTERN)?.[1] ?? null,
  };
}
