/**
 * Execpolicy `.rules` generator for the Codex adapter.
 *
 * `.rules` is Starlark. The only rule form emitted is
 * `prefix_rule(pattern=[...], decision=..., justification=...)`. Matching is
 * token-prefix over argv, which is why nested-list alternation
 * (`pattern=["git", ["push", "clean"]]`) covers several subcommands under
 * one "git" prefix instead of one rule per subcommand.
 *
 * This layer is defence-in-depth only, never a security boundary — the
 * disclosure comment below is emitted verbatim into the generated text so a
 * later edit cannot quietly narrow that claim.
 */

export const FORBIDDEN_GIT_SUBCOMMANDS = Object.freeze(['push', 'clean', 'reset']);

const DISCLOSURE_COMMENT = `# Defence-in-depth only -- not a security boundary.
#
# Known bypasses (verified, not hypothetical): interposed global options
# defeat the prefix match entirely. \`git -C . push\`, \`git --git-dir=.git
# push\`, and \`bash -lc 'git push'\` all NO MATCH here -- matching is
# token-prefix over argv, not an adversarial parser.
#
# A malformed .rules file does not fail closed: treat it as fail open
# (unresolved) at runtime, the same as no rule matching at all.`;

/**
 * Never emit a rule that degenerates to a bare `pattern=["git"]` — that
 * would forbid every git invocation and break craft's own git-heavy
 * workflow (the same reason the copilot binding rejected a blanket
 * shell(git:*) rule). The forbidden subcommands are named explicitly and
 * matched only alongside the leading "git" token.
 */
const RULES = [
  {
    pattern: ['git', [...FORBIDDEN_GIT_SUBCOMMANDS]],
    decision: 'forbidden',
    justification:
      'destructive or history-rewriting git subcommands must never run unattended from this binding',
  },
];

function renderPatternElement(element) {
  if (Array.isArray(element)) {
    return renderPatternLiteral(element);
  }
  return JSON.stringify(element);
}

function renderPatternLiteral(pattern) {
  return `[${pattern.map(renderPatternElement).join(', ')}]`;
}

function renderRule({ pattern, decision, justification }) {
  return [
    'prefix_rule(',
    `    pattern=${renderPatternLiteral(pattern)},`,
    `    decision="${decision}",`,
    `    justification="${justification}",`,
    ')',
  ].join('\n');
}

/**
 * Render the full Starlark `.rules` text this binding ships.
 *
 * @returns {string} the generated `.rules` file contents
 */
export function buildExecpolicyRules() {
  // equivalent mutant (StringLiteral ""): RULES holds a single rule, so the
  // separator never renders — a second rule makes this observable again.
  const rulesText = RULES.map(renderRule).join('\n\n');
  return `${DISCLOSURE_COMMENT}\n\n${rulesText}\n`;
}

/**
 * Verify a deployed `.rules` file is byte-identical to the text this binding
 * generates, throwing on any drift. Codex's runtime enforcement path fails OPEN
 * on a malformed/unparseable `.rules` file — it logs "Error parsing rules; custom
 * rules not applied." and runs the command anyway (pinned live against the codex
 * binary). A corrupted or truncated deployed rules file therefore silently voids
 * the whole execpolicy layer. This is the scriptable launch/install precondition
 * that catches that BEFORE relying on the layer: regenerate the expected text and
 * byte-compare — hermetic, deterministic, no codex subprocess, and it catches every
 * drift (malformed content included), not one probed variant. Refuse rather than
 * proceed with silently-void enforcement.
 *
 * @param {string} onDiskText - the contents of the deployed craft.rules file
 * @returns {{ intact: true }} when the text matches
 * @throws {Error} when the text drifts from the generated rules
 */
export function assertRulesIntegrity(onDiskText) {
  const expected = buildExecpolicyRules();
  if (onDiskText !== expected) {
    throw new Error(
      'craft execpolicy rules integrity check failed: the deployed .rules file does not match the generated rules — codex fails OPEN on a malformed rules file, so refuse rather than run with silently-void enforcement',
    );
  }
  return { intact: true };
}
