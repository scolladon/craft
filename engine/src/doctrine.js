const ENTRY_HEADING = /^## D-(\d+) — (.+)$/;
const SECTION_HEADING_PREFIX = '## ';
export const DOCTRINE_BULLETS = Object.freeze(['Trigger', 'Rule', 'Evidence', 'Counter-cases']);
const BULLET = /^- \*\*([^*]+):\*\*(.*)$/;
const ADR_REF = /ADR-(\d{3})\b/g;
const NO_COUNTER_CASES = 'none';
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

function checkReferences(id, evidence, counterText, counterCases) {
  const messages = [];
  if (evidence.length === 0) messages.push(`D-${id}: evidence is empty`);
  if (counterText !== NO_COUNTER_CASES && counterCases.length === 0) {
    messages.push(`D-${id}: counter-cases must be none or ADR-NNN — <why> items`);
  }
  return messages;
}

function buildEntry(section, id, title, errors) {
  const values = parseBullets(section.body);
  if (!values) {
    errors.push({ line: section.line, message: `D-${id}: bullets must be exactly, in order: ${BULLET_LABELS}` });
    return null;
  }
  const [trigger, rule, evidenceText, counterText] = values;
  const evidence = adrRefs(evidenceText);
  const counterCases = adrRefs(counterText);
  const messages = checkReferences(id, evidence, counterText, counterCases);
  messages.forEach((message) => errors.push({ line: section.line, message }));
  return { id, title, trigger, rule, evidence, counterCases, line: section.line };
}

function checkId(id, line, state, errors) {
  if (state.seen.has(id)) errors.push({ line, message: `duplicate id D-${id}` });
  else if (id < state.previous) errors.push({ line, message: `D-${id} out of order` });
  state.seen.add(id);
  state.previous = Math.max(state.previous, id);
}

export function parseDoctrine(content) {
  const entries = [];
  const errors = [];
  const state = { seen: new Set(), previous: 0 };
  for (const section of splitSections(content)) {
    const match = ENTRY_HEADING.exec(section.heading);
    if (!match) {
      errors.push({ line: section.line, message: MALFORMED_HEADING });
      continue;
    }
    const id = Number(match[1]);
    checkId(id, section.line, state, errors);
    const entry = buildEntry(section, id, match[2], errors);
    if (entry) entries.push(entry);
  }
  return { entries, errors };
}
