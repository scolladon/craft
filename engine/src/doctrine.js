const ENTRY_HEADING = /^## D-(\d+) — (.+)$/;
const SECTION_HEADING_PREFIX = '## ';
export const DOCTRINE_BULLETS = Object.freeze(['Trigger', 'Rule', 'Evidence', 'Counter-cases']);
const BULLET = /^- \*\*([^*]+):\*\*(.*)$/;
const ADR_REF = /ADR-(\d{3})\b/g;
const NO_COUNTER_CASES = 'none';
const COUNTER_CASE_ITEM = /^ADR-(\d{3}) — \S/;
const COUNTER_CASE_SEPARATOR = ';';
const CODE_FENCE = /^\s*(```|~~~)/;
const BULLET_LABELS = DOCTRINE_BULLETS.join(', ');
const MALFORMED_HEADING = 'heading must be "## D-<n> — <title>"';

function adrRefs(text) {
  return [...text.matchAll(ADR_REF)].map((match) => match[1]);
}

function splitSections(content) {
  const sections = [];
  let inFence = false;
  content.split('\n').forEach((text, index) => {
    if (CODE_FENCE.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (text.startsWith(SECTION_HEADING_PREFIX)) {
      sections.push({ heading: text, line: index + 1, body: [] });
      return;
    }
    if (sections.length > 0 && text.trim() !== '') sections.at(-1).body.push(text);
  });
  return sections;
}

function parseBullets(body) {
  const bullets = body.map((text) => BULLET.exec(text));
  if (bullets.length !== DOCTRINE_BULLETS.length) return null;
  const labelsMatch = bullets.every((match, i) => match && match[1] === DOCTRINE_BULLETS[i]);
  if (!labelsMatch) return null;
  const values = bullets.map((match) => match[2].trim());
  return values.every((value) => value !== '') ? values : null;
}

function counterCaseIds(counterText) {
  if (counterText === NO_COUNTER_CASES) return [];
  const heads = counterText.split(COUNTER_CASE_SEPARATOR).map((item) => COUNTER_CASE_ITEM.exec(item.trim()));
  return heads.every(Boolean) ? heads.map((match) => match[1]) : null;
}

function checkReferences(id, evidence, counterCases) {
  const messages = [];
  if (evidence.length === 0) messages.push(`D-${id}: evidence is empty`);
  if (counterCases === null) messages.push(`D-${id}: counter-cases must be none or ADR-NNN — <why> items`);
  return messages;
}

function buildEntry(section, id, title) {
  const values = parseBullets(section.body);
  if (!values) {
    return { entry: null, errors: [{ line: section.line, message: `D-${id}: bullets must be exactly, in order: ${BULLET_LABELS}` }] };
  }
  const [trigger, rule, evidenceText, counterText] = values;
  const evidence = adrRefs(evidenceText);
  const counterCases = counterCaseIds(counterText);
  const errors = checkReferences(id, evidence, counterCases).map((message) => ({ line: section.line, message }));
  return { entry: { id, title, trigger, rule, evidence, counterCases: counterCases ?? [], line: section.line }, errors };
}

function idErrors(id, line, state) {
  if (state.seen.has(id)) return [{ line, message: `duplicate id D-${id}` }];
  if (id < state.previous) return [{ line, message: `D-${id} out of order` }];
  return [];
}

function parseSection(section, state) {
  const match = ENTRY_HEADING.exec(section.heading);
  if (!match) return { entry: null, errors: [{ line: section.line, message: MALFORMED_HEADING }], state };
  const id = Number(match[1]);
  const built = buildEntry(section, id, match[2]);
  const nextState = { seen: new Set([...state.seen, id]), previous: Math.max(state.previous, id) };
  return { entry: built.entry, errors: [...idErrors(id, section.line, state), ...built.errors], state: nextState };
}

export function parseDoctrine(content) {
  const initial = { entries: [], errors: [], state: { seen: new Set(), previous: 0 } };
  const result = splitSections(content).reduce((acc, section) => {
    const parsed = parseSection(section, acc.state);
    const entries = parsed.entry ? [...acc.entries, parsed.entry] : acc.entries;
    return { entries, errors: [...acc.errors, ...parsed.errors], state: parsed.state };
  }, initial);
  return { entries: result.entries, errors: result.errors };
}
