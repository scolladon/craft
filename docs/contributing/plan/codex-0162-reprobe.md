# Plan — codex 0.162.1 re-probe: version-free rules disclosure, per-surface malformed-rules status, re-pinned records

> Source: design doc `docs/contributing/design/codex-0162-reprobe.md` · ADRs `573-577`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Overview — four parts, the design's Parts 1–4

| Part | Design part | Ships | Commit type |
|---|---|---|---|
| 1 | 1 (ADR-573 = in) | generated rules disclosure, integrity JSDoc + refusal message, regenerated rules file, two RED pins + one GUARD | `fix(codex)` |
| 2 | 2 | POC record: row re-pins + new `## Re-probe — codex-cli 0.162.1` section | `docs(codex)` |
| 3 | 3 | adapter README re-pins + per-surface `.rules` bullet + one README honesty pin | `docs(codex)` |
| 4 | 4 | BACKLOG: three entries amended in place + one new run-scoped `### Open` section | `docs(backlog)` |

Design Part 5 (adapters/README.md *Probe records*) is **out**: ADR-577 keeps the credential
remedy in the POC record only. The design's two proven out-of-scope items (the describe title at
adapters/codex/test/native-surface.test.js:84; no install doc deploys craft.rules) stay out: do
not touch them.

Order matters: Parts 3 and 4 cite the record section Part 2 creates. Parts share one working
tree and build on each other; each part is one atomic commit.

## Facts every part needs (verified against this tree at f96bea4 — do not re-verify)

- **No live codex, ever.** The evidence is pinned in the design doc's *Context* (the
  "Pinned matrix — codex-cli 0.162.1" table, design L27–75, rows 1–5i, plus the credential
  paragraph at L37–44). Copy from there. Do not re-derive, do not run `codex`.
- **Decided wording** (ADRs 573–577, all as recommended):
  - ADR-573: the generated disclosure, the `assertRulesIntegrity` JSDoc and its refusal message say
    a malformed `.rules` file is not a reliable denial — depending on the codex entry point it
    either refuses to start or skips the rules and runs commands — so treat it as fail open. **No
    codex version in the generated file.**
  - ADR-574: the record, adapter README and BACKLOG state the split **pinned to 0.162.1**:
    `codex exec` refuses to start (fails closed, 3/3); the app-server thread/turn path warns,
    skips the rules and runs the command (fails open, 3/3); the TUI is unprobed. "Treat it as fail
    open" stays. Every existing `/fail open/i` pin keeps matching.
  - ADR-575: the BACKLOG `.rules` entry is amended in place with a dated 0.162.1 paragraph; a new
    `### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet
    scheduled)` section holds two **question-only** entries (TUI path; unwired integrity check).
  - ADR-576: every surface this run touches that describes the integrity check calls it an
    exported, unit-tested check with no caller in the binding, which protects only when something
    invokes it. "install/launch precondition" is dropped. The adapter README never names the check
    today — do not add it there.
  - ADR-577: the realised credential rotation and the login-inside-throwaway remedy live in the
    POC record only.
- **ADR-255 statement (b)** ("a malformed `.rules` file **may fail open** at runtime") ships
  verbatim, not softened. A reword may sharpen it, never drop the fail-open posture.
- **ADR-320**: the POC record appends a dated section and corrects only rows the re-probe
  re-observed, each named by version; older pins stay beside the new ones.
- **Path hygiene.** Committed text uses repo-relative paths and placeholders only (`<throwaway>`,
  `<worktree>`, `<repo>`, `<node-bin>`, `<path>`). Before each commit:
  `git diff --no-ext-diff --cached | grep -nE '/Users/|/home/'` must print nothing.
- **Lint traps by surface** (each verified in the test source named):
  - Authored adapter surfaces (adapters/codex README.md, craft.rules, …) are swept by
    adapters/codex/test/native-surface.test.js L277–305: no `PROVENANCE_REF`
    (`/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`), no `` !`…` `` shell-injection form, no
    bare `${CLAUDE_PLUGIN_ROOT}`. Version strings such as 0.162.1 pass.
  - Shipped source (adapters/*/src/**) is swept whole-line by test/source-hygiene.test.js for
    `ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+` and case-sensitive `R\d+|T\d+|F\d+`.
  - docs/contributing/specs/** is swept case-sensitively by test/source-hygiene.test.js for
    Class A `stryker|mutmut|cosmic-ray|cargo-mutants|mutation|mutant|dependency-cruiser|depcruise`
    and Class B `\bgh\b|\bgithub\b`. The POC record must never contain those words.
  - No provenance refs (ADR/part/backlog numbers) in source or test. BACKLOG and the POC record
    are ledgers and already carry commit SHAs; do not add ADR numbers to them either.
- **Gate output discipline.** `scripts/ci.sh` output is long: always pipe it to a file and grep.
  A green run exits 0 and every `# fail` line reads `# fail 0`.

## Part 1 — make the generated rules disclosure version-free and true

### Context

Files this part edits:

- `adapters/codex/src/execpolicy-rules.js`
  - `DISCLOSURE_COMMENT` — module-private `const` template literal, L17–25. L24–25 are the stale
    clause being replaced: "# A malformed .rules file does not fail closed: treat it as fail open"
    / "# (unresolved) at runtime, the same as no rule matching at all.". L17–23 (the "Defence-in-depth
    only" line and the known-bypasses block) stay byte-identical.
  - `assertRulesIntegrity(onDiskText)` JSDoc, L76–91. L78–86 are being replaced: they claim codex's
    runtime "fails OPEN … runs the command anyway (pinned live against the codex binary)" and call
    the function "the scriptable launch/install precondition". The `@param`/`@returns`/`@throws`
    lines stay.
  - The thrown message, L96: `'craft execpolicy rules integrity check failed: the deployed .rules
    file does not match the generated rules — codex fails OPEN on a malformed rules file, so
    refuse rather than run with silently-void enforcement'`.
  - Unchanged: `FORBIDDEN_GIT_SUBCOMMANDS` (L15), `RULES` (L34–41), `buildExecpolicyRules()`
    signature and body (L69–74, including the equivalent-mutant comment at L70–71), the
    `assertRulesIntegrity` signature and its `{ intact: true }` return.
- `adapters/codex/craft.rules` — **generated**, never hand-edited. Today L8–9 carry the stale
  clause. Regenerate from the repo root with
  `(cd adapters/codex && node --input-type=module -e "import('./src/execpolicy-rules.js').then(m => process.stdout.write(m.buildExecpolicyRules()))" > craft.rules)`.
  Verified on this tree: run against the unedited generator it reproduces the committed file
  byte-for-byte. After this part the file is one line longer (the clause goes from 2 lines to 3).
- `adapters/codex/test/execpolicy-rules.test.js` (imports `buildExecpolicyRules`,
  `assertRulesIntegrity`, `FORBIDDEN_GIT_SUBCOMMANDS` at L6; local `PROVENANCE_REF_RE` at L8):
  - `describe('buildExecpolicyRules() — honesty disclosure')`, L51–58: one `it` pinning
    `/git -c/i` and `/fail open/i`. Both stay. Add the new `it`s inside this describe.
  - `describe('committed craft.rules — drift guard')`, L60–68: byte-equality of the committed file
    and the generator. Goes red the moment `DISCLOSURE_COMMENT` is edited, green again after
    regeneration — that is its job, not a RED entry.
  - `describe('assertRulesIntegrity() — refuse a drifted/malformed deployed rules file (codex fails
    open)')`, L70–97: four `it`s, all matching only `/integrity check failed/`. The title stays
    (fail open is still the posture). Add the new `it` inside this describe. Reuse the existing
    malformed fixture string `'prefix_rule(\n    pattern=["git", ["push"'` (L89).
  - `describe('buildExecpolicyRules() — no provenance refs')`, L111–117 — sweeps the new text.

Read-only references (do not edit): adapters/codex/test/native-surface.test.js L269 reads
craft.rules into the hygiene loops (L277–305), which must stay green. engine/stryker.conf.json
already lists adapters/codex/src/execpolicy-rules.js in `mutate` (L26) and its suite in
`tap.testFiles` (L8) — no config change. Nothing outside the test calls `assertRulesIntegrity`
(design *Facts*); no other file pins the replaced strings (grep over adapters, engine/test, test,
scripts found only the source itself).

House test style: Given/When/Then titles, AAA body, a `sut` variable, `node:test` +
`node:assert/strict`.

### TDD steps

1. **RED** — in the honesty-disclosure describe, add:
   ```js
   it('Given the generated rules text, when scanned, then it names the refuse-to-start outcome and no longer claims a malformed file never fails closed', () => {
     const sut = buildExecpolicyRules();

     assert.match(sut, /refuses?\s+to\s+start/i);
     assert.doesNotMatch(sut, /does not fail closed/i);
   });
   ```
   Fails because `DISCLOSURE_COMMENT` today says "does not fail closed" and never mentions a
   refusal to start.
2. **GUARD** — in the same describe, add
   `it('Given the generated rules text, when scanned, then it carries no codex version string', …)`
   with `assert.doesNotMatch(sut, /\b\d+\.\d+\.\d+\b/)`. Passes today (the current text carries
   no version); it holds the version-free rule against a future re-probe pasting a pin into the
   generated file.
3. **RED** — in the `assertRulesIntegrity()` describe, add:
   ```js
   it('Given a malformed deployed rules text, when assertRulesIntegrity refuses it, then the reason says codex can skip the rules and run commands', () => {
     const sut = assertRulesIntegrity;

     assert.throws(() => sut('prefix_rule(\n    pattern=["git", ["push"'), /can skip a malformed rules file and run commands/);
   });
   ```
   Fails because the thrown message today says "codex fails OPEN on a malformed rules file".
4. **GREEN** — edit `adapters/codex/src/execpolicy-rules.js`:
   - Replace `DISCLOSURE_COMMENT` L24–25 with (user-approved wording, wrapped to the
     generator's `# ` comment style; L17–23 untouched; keep the closing backtick + `;`):
     ```
     # A malformed .rules file is not a reliable denial: depending on the codex
     # entry point it either refuses to start or skips the rules and runs
     # commands. Treat it as fail open.
     ```
   - Replace JSDoc L78–86 (from "Codex's runtime enforcement path…" through "…silently-void
     enforcement.") with:
     ```
      * generates, throwing on any drift. A malformed `.rules` file is not a reliable
      * denial: depending on the codex entry point, codex either refuses to start or
      * skips the rules with a warning and runs commands anyway, which silently voids
      * the whole execpolicy layer. Regenerating the expected text and byte-comparing
      * is hermetic and deterministic, needs no codex subprocess, and catches every
      * drift (malformed content included), not one probed variant. Nothing in the
      * binding calls this check yet: it protects only when a caller runs it before
      * relying on the layer, and then refuses rather than proceed.
     ```
     (L77 "Verify a deployed `.rules` file is byte-identical to the text this binding" stays as
     the first line; the block above continues it.)
   - Replace the L96 message with:
     `'craft execpolicy rules integrity check failed: the deployed .rules file does not match the generated rules — depending on the entry point, codex can skip a malformed rules file and run commands anyway, so refuse rather than run with silently-void enforcement'`.
   - Regenerate `adapters/codex/craft.rules` with the command in *Context*. Then
     `node --test adapters/codex/test/execpolicy-rules.test.js` — both REDs, the GUARD, the drift
     guard and the on-disk integrity `it` (L79–84) are green.
5. **REFACTOR** — re-read the three edited texts against ADR-573: no codex version, "fail open"
   kept, the "Defence-in-depth only" and known-bypasses lines unchanged, no ADR/part/backlog
   number. `git diff --no-ext-diff adapters/codex/craft.rules` shows only the clause swap
   (2 lines out, 3 in).

### Gate

```
node --test adapters/codex/test/execpolicy-rules.test.js adapters/codex/test/native-surface.test.js
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

Mutation, narrowed to the one file and its own suite (config in a mktemp dir, never in the
worktree; ONE `--mutate` value):

```
N="$(mktemp -d)"
node -e "const c=require('./engine/stryker.conf.json');c.tap.testFiles=['adapters/codex/test/execpolicy-rules.test.js'];c.mutate=['adapters/codex/src/execpolicy-rules.js'];require('fs').writeFileSync(process.argv[1],JSON.stringify(c))" "$N/stryker.narrow.json"
engine/node_modules/.bin/stryker run "$N/stryker.narrow.json" --mutate adapters/codex/src/execpolicy-rules.js > "$N/stryker.out" 2>&1; echo "exit=$?"
grep -nE 'Instrumented|Initial test run|killed|Survived' "$N/stryker.out"
```

Baseline measured on the unedited tree with exactly this command (in a throwaway clone):
`Instrumented 1 source file(s) with 38 mutant(s)`, killed 37, one `[Survived] StringLiteral` at
the `RULES.map(renderRule).join('\n\n')` line (L72:48 today) — the equivalent mutant already
documented in the comment above it. Expected after this part: instrumented count > 0 and still
38, one survivor at that same statement (one line lower, since the disclosure grows by a line),
no other survivor. Any other survivor: add the killing assertion; never an equivalent-mutant
comment for a string this part wrote.

### Commit

`fix(codex): state that a malformed rules file either refuses to start or runs without its rules`

## Part 2 — record the codex-cli 0.162.1 re-probe in the POC record

### Context

File this part edits: `docs/contributing/specs/codex-poc-record.md` (526 lines; last line is the
final row of `## Re-probe — codex-cli 0.161.0`, L510–526).

Anchors (re-verified on this tree; the row number is the line):

- L17 "Binary self-report" — "codex-cli 0.145.0" / "CONFIRMED (0.145.0)".
- L18 "npm package version" — "@openai/codex@0.145.0" / "CONFIRMED (0.145.0)".
- L19 "Do they agree?" — "**Yes** — …" / "CONFIRMED".
- L21 "Install path" — ends "…**not** a delta against a prior layout." / "CONFIRMED (0.145.0)";
  contains "Observed on 0.145.0."
- L49 `### 0.145.0 re-probe method`; L51–53 "**Scope — this record carries two version pins at
  once.** Only rows explicitly marked (0.145.0) and the Re-probe — codex-cli 0.145.0 section
  below were observed on 0.145.0. Every other row remains a 0.144.6 observation and was not
  re-probed." The count "two" is already false (0.161.0 added a third).
- L114 "**Skills by reference?**" — status "**DISPROVEN (0.145.0)**".
- L116 "Plugin install" — status "**CONFIRMED (0.145.0 — install exercised live):** …".
- L139 untrusted hook — status "**CONFIRMED (0.144.6; re-confirmed 0.145.0) — and this is the most
  dangerous behaviour found in this probe**".
- L140 "Can trust be persisted?" — status "CONFIRMED (0.145.0; write path exercised)".
- L185–188, under `### Execpolicy .rules — argv-aware, but with a real gap` (L156): "A malformed
  .rules file is a hard error (exit 1) in execpolicy check. Whether the **runtime** path fails open
  is unresolved — … **DEFERRED, and it should be treated as fail-open until proven otherwise.**"
- L310 heading `## Open rows — closed / updated (rows 2–5: 2026-07-21 on 0.144.6; rows 0–1:
  revisited 2026-07-31 on 0.145.0)`; L312–319 its method paragraph. No document links to this
  heading's anchor (grep for "open-rows"/"codex-poc-record.md#" found only design/plan prose).
- L323 row 0 — status "**OPEN — the codex limitation is lifted, the verification is not wired**";
  evidence ends "…The row stays open until verification is wired into a launch. |".
- L324 row 1 — status "**DISPROVEN (re-pinned 0.144.6 → 0.145.0)**"; evidence ends "…Still a
  codex limitation; stays OPEN. |".
- L326 row 3 "Malformed .rules fails open at runtime" — status "**CONFIRMED fail-open
  (mitigated)**"; evidence "Runtime loads $CODEX_HOME/rules/; binary carries Error parsing rules;
  custom rules not applied. → rules not applied on parse error. Mitigation 115bcce:
  assertRulesIntegrity byte-compares deployed rules to the generator, refuses on drift."
- L497–508 `### Isolation-method caveat — the mtime proof has a blind spot`; L506–508 is the
  "Rule for any refresh…" paragraph ending "…expect a re-login may be needed afterwards."
- After L526: the new section. Its shape mirrors `## Re-probe — codex-cli 0.161.0` (L510–526): a
  method paragraph, then a `| Probe | Result |` table, every result prefixed
  `**CONFIRMED (0.162.1).**`, `**DISPROVEN (0.162.1).**` or `**DEFERRED (0.162.1).**`.

**Not re-labelled** (0.162.1 did not re-observe them): the payload shape (L404–429), the hook
shell and quoting rows (0.161.0), the `hooks/list` auth row (L478), the stdin-EOF row (L481–495),
the non-0/2 exit row (L526), the execution/model/telemetry/sandbox ports, the matcher table
(L165–183), the 0.145.0 skills section (L431–446).

Read-only sources: the evidence matrix in the design doc (docs/contributing/design/codex-0162-reprobe.md
L27–75). Gates that read this file: test/source-hygiene.test.js (Class A/B words — see *Facts*),
intention-lint (the record has no `subjects:` frontmatter, so it is skipped; do **not** add
frontmatter), test/living-corpus.test.js (lists the path; no content check). No test pins any
line being replaced. Prose-lint skips docs/contributing/specs.

### TDD steps

No behaviour changes and no test asserts over this evidence record; inventing a text-pin would
pin wording, not behaviour. The executable checks are the repo's gates.

1. **GUARD (gate-first)** — before editing run `node --test test/source-hygiene.test.js` and
   `grep -nE 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md`
   (prints nothing today). Both pass today; they must still pass after the edit.
2. **GREEN — in-place row edits**, each keeping the older pin beside the new one:
   - L17: "`codex-cli 0.162.1` (was `codex-cli 0.145.0`)" / "CONFIRMED (0.162.1; first pinned
     0.145.0)". L18: "`@openai/codex@0.162.1`, platform package `0.162.1-darwin-arm64`, read from
     the installed package (was `@openai/codex@0.145.0`)" / "CONFIRMED (0.162.1; first pinned
     0.145.0)". L19: status "CONFIRMED (re-confirmed 0.162.1)". L21: "Observed on 0.145.0;
     unchanged on 0.162.1." / "CONFIRMED (0.145.0; re-confirmed 0.162.1)". The old identity
     values stay inline because these rows are their only record (ADR-320: no older observation
     is erased).
   - L51–53: "**Scope — this record carries several version pins at once.** Each re-probed row
     names its version — rows marked `(0.145.0)`, `(0.161.0)` or `(0.162.1)`, and the matching
     `Re-probe — codex-cli <version>` sections below, were observed on that version. Every
     unmarked row remains a 0.144.6 observation and was not re-probed." Nothing else in that
     subsection changes.
   - L114 status: "**DISPROVEN (0.145.0; re-confirmed 0.162.1)**"; append to the cell text
     "Re-confirmed on 0.162.1: same 0 of 19 versus 19 of 19."
   - L116 status: "**CONFIRMED (0.145.0 — install exercised live; re-exercised 0.162.1 with
     `./adapters/codex`):**" — rest of the cell unchanged.
   - L139 status: "**CONFIRMED (0.144.6; re-confirmed 0.145.0; re-confirmed 0.162.1) — and this is
     the most dangerous behaviour found in this probe**".
   - L140 status: "CONFIRMED (0.145.0; write path exercised; re-exercised 0.162.1 via
     `bin/trust-hook.js`, byte-identical re-run)".
   - After L188 (same paragraph): "That is the 0.144.6 statement. **Resolved on 0.162.1, split by
     surface:** `codex exec` refuses to start (exit 1, `Error loading rules: … starlark error`; it
     fails closed, 3/3); the app-server thread/turn path emits a `configWarning`, skips the rules
     and runs the command (it fails open, 3/3); the interactive TUI was not probed. Still treat a
     malformed `.rules` file as fail open."
   - L310 heading: append "; rows 0, 1, 3: revisited 2026-10-15 on 0.162.1" inside the
     parentheses. L312–319: add one sentence — "Rows 0, 1 and 3 were revisited again on
     `codex-cli 0.162.1` under the same protocol; see `Re-probe — codex-cli 0.162.1`."
   - L323 row 0: status unchanged (stays OPEN). Append to evidence, before the closing `|`: "On
     0.162.1 the untrusted-hook silent no-op was re-confirmed, and `bin/trust-hook.js` worked end to
     end (trust write, `--check`, byte-identical re-run, BLOCK and ALLOW by side effect). Still no
     launch path calls `--check`."
   - L324 row 1: status "**DISPROVEN (re-pinned 0.145.0 → 0.162.1)**". Keep the evidence text;
     append "Re-probed on 0.162.1 the same way: 0/19 versus 19/19, and both cached manifests are
     still `{description, name}`."
   - L326 row 3: status "**fail-open on the app-server path, fail-closed on `codex exec`
     (0.162.1) — treat as fail open**". Evidence: "Runtime loads `$CODEX_HOME/rules/`. 2026-07-21
     (0.144.6): the recorded basis was the binary string `Error parsing rules; custom rules not
     applied.` alone; no runtime side effect was recorded. 0.162.1, by side effect: `codex exec`
     refuses to start (fail closed, 3/3); the app-server thread/turn path warns, skips the rules
     and runs the command (fail open, 3/3); the TUI is unprobed. `assertRulesIntegrity`
     (`115bcce`) byte-compares deployed rules to the generator and refuses on drift. It is an
     exported, unit-tested check with no caller in the binding, so it protects only when something
     invokes it."
   - After L508 (end of the caveat's "Rule for any refresh…" paragraph): "It happened. On
     2026-10-15 a copy of the operator's `auth.json` — last written 2026-07-31, the day of the
     0.145.0 re-probe — returned HTTP 401. The 0.162.1 re-probe avoided a second rotation by
     running `codex login` inside the throwaway `CODEX_HOME` instead of copying a credential (see
     `Re-probe — codex-cli 0.162.1`)."
3. **GREEN — append the new section after L526** (one blank line before it). Copy facts from
   the design matrix; do not reword numbers or quoted strings:
   ```
   ## Re-probe — codex-cli 0.162.1

   Method: one throwaway `HOME`/`CODEX_HOME` (`<throwaway>`), with every `codex` invocation wrapped
   in it, `--version` included. Isolation proven by `find ~/.codex -newer <marker>` = 0 entries,
   while 185 entries landed in the throwaway. `--dangerously-bypass-hook-trust` was never used.
   Every block was verified by its ground-truth side effect, never by exit code. Target repo: a
   `git init` throwaway with one modified tracked file. Every row is pinned to 0.162.1; where it
   differs from the 0.145.0 or 0.161.0 sections above, both stay, each pinned to its version.

   | Probe | Result |
   |---|---|
   | Credentials (0.162.1) | … |
   …
   ```
   One row per bullet, in this order, each result opening with its status prefix:
   - **Credentials** — CONFIRMED: the copied `auth.json` returned HTTP 401 `Could not parse your
     authentication token`; the real one was last written 2026-07-31 (the 0.145.0 re-probe used up
     that refresh token), as *Isolation-method caveat* predicted. Remedy: the operator ran
     `codex login` **inside** the throwaway `CODEX_HOME`, through the browser flow, because
     device-code sign-in is off for this account unless enabled in ChatGPT Security Settings. The
     real home was never touched and not rotated again.
   - **Identity** — CONFIRMED: `codex-cli 0.162.1`; npm `@openai/codex` package version `0.162.1`,
     platform package `0.162.1-darwin-arm64` (read from the installed package, no codex run);
     vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`,
     the 0.145.0 layout. Binary and package agree.
   - **Plugin install** — CONFIRMED: `codex plugin marketplace add ./adapters/codex`, then
     `plugin add craft-codex@craft-codex-marketplace` and `plugin add craft@craft-codex-marketplace`.
     Both cached `.codex-plugin/plugin.json` are `{description, name}`: `skills` and `hooks`
     dropped — unchanged from 0.145.0.
   - **Skills by reference** — DISPROVEN: app-server `skills/list` with
     `{"cwds":[<worktree>],"forceReload":true}` lists **0 of 19** shared skills (6 in total:
     `craft-codex:craft-run` at scope user, plus 5 system skills). `forceReload` is present in the
     0.162.1 generated schema `SkillsListParams`; the 0.145.0 section never captured the
     `skills/list` params, so this is a first observation, not a delta.
   - **Symlink fallback** — CONFIRMED: `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` ×19
     gives **19 of 19**, registered `craft:<name>`, scope `user`, paths resolving to the repo.
   - **Untrusted hook** — CONFIRMED, fail-open reproduced: the template `[[hooks.PreToolUse]]`
     block copied verbatim into the throwaway `config.toml`, `CRAFT_ROOT=<worktree>`;
     `trust-hook.js --check` → exit 1, `from=untrusted`; `codex exec --json -s workspace-write -C
     <target>` told to run `git diff > OUT.txt` ran it (`/bin/zsh -lc 'git diff > OUT.txt'`, exit
     0), `OUT.txt` exists (101 B), and the JSONL stream has **zero** hook or warning items.
   - **Trust write, check, idempotence** — CONFIRMED: `trust-hook.js` → exit 0, `trusted …
     from=untrusted hash=sha256:38713365…` (the 0.161.0 hash); `--check` → exit 0 `from=trusted
     action=noop`; a re-run → exit 0 `already trusted`, `config.toml` byte-identical (shasum
     unchanged).
   - **BLOCK and ALLOW** — CONFIRMED: trusted, `git diff > OUT.txt` → `OUT.txt` **absent**, the
     agent reports the call blocked by craft-guard requiring `--no-ext-diff`, no
     `command_execution` item; `git diff --no-ext-diff > ALLOWED.txt` → 101 B, a real unified diff.
   - **Rules, well-formed control** — CONFIRMED: `adapters/codex/craft.rules` deployed to
     `$CODEX_HOME/rules/craft.rules` with the hook block removed; `codex execpolicy check` →
     `forbidden` (matchedPrefix `git clean`); `codex exec` told to run `git clean -f` → the
     untracked `VICTIM.txt` survived; app-server `thread/start` (`approvalPolicy` never, sandbox
     workspace-write) + `turn/start` → `VICTIM.txt` survived ("blocked by … safety policy").
   - **Malformed rules, `execpolicy check`** — CONFIRMED: last line `)` removed (a starlark parse
     error at line 15 of the file as deployed) → exit 1, a hard error.
   - **Malformed rules, `codex exec`** — CONFIRMED, **fails closed**: 3/3 exit 1 at startup with
     `Error loading rules: <path>:15: starlark error: … Parse error`; zero JSONL events;
     `VICTIM.txt` survived. This is the binding's own launch path (`codex exec`).
   - **Malformed rules, app-server thread/turn** — CONFIRMED, **fails open**: 3/3 a
     `configWarning` notification `{"summary":"Error parsing rules; custom rules not applied.", …}`,
     then `git clean -f` ran and `VICTIM.txt` was **deleted**.
   - **Binary string** — CONFIRMED: `Error parsing rules; custom rules not applied.` still sits
     beside app-server code.
   - **Interactive TUI rules path** — DEFERRED: whether the TUI goes through the app-server path
     was not probed.
   - **Integrity check against the probed malformed text** — CONFIRMED (hermetic, no codex run):
     `assertRulesIntegrity(<craft.rules minus its last line>)` throws `integrity check failed`;
     against the committed file it returns `{ intact: true }`. Nothing in the binding calls it.

   Close the section with one paragraph: the 2026-07-21 runtime fail-open verdict was planned as a
   `codex exec` run, but its only recorded evidence is the binary string; on 0.162.1 it holds on
   the app-server path and is false on `codex exec`, the binding's launch posture, where a
   malformed rules file now stops the whole run loudly. Treat a malformed `.rules` file as fail
   open.
4. **REFACTOR** — re-read every row **not** in the edit list and confirm none now reads as
   re-probed on 0.162.1. Re-run the step-1 grep and `node --test test/source-hygiene.test.js`.

### Gate

```
node --test test/source-hygiene.test.js test/living-corpus.test.js
grep -nE 'stryker|mutmut|mutation|mutant|\bgh\b|\bgithub\b' docs/contributing/specs/codex-poc-record.md   # must print nothing
git diff --no-ext-diff docs/contributing/specs/codex-poc-record.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok|intention-lint' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): record the codex-cli 0.162.1 re-probe and the per-surface malformed-rules result`

## Part 3 — adapter README: re-pin to 0.162.1 and split the malformed-rules bullet by surface

### Context

Files this part edits:

- `adapters/codex/README.md` (anchors re-verified on this tree):
  - *Load*, L31–33: "…and the cached .codex-plugin manifest observed on 0.145.0 is just" —
    the only change is "observed on 0.145.0" → "observed on 0.145.0 and again on 0.162.1".
  - *Load*, L40–42: the trust key "observed live on 0.145.0" — **unchanged** (the 0.162.1
    evidence elides the key).
  - *Load*, L48: "**The 19 shared skills do NOT load by reference on Codex 0.145.0 (pinned
    live).**" → "**The 19 shared skills do NOT load by reference on Codex 0.162.1 (pinned live;
    first pinned on 0.145.0).**". L49–59 (0 of 19 vs 19 of 19, "this IS the working path …
    required on every install, not a contingency", the `ln -s` block) stay word for word.
  - *Install-time hook trust*, L95–96: "**A PreToolUse hook that has never been trusted silently
    no-ops.** This was pinned" / "live: the identical run…" → "This was pinned live, and
    re-confirmed on 0.162.1: the identical run…". Steps L101–137 unchanged (step 1's auth
    paragraph is not touched — unauthenticated `hooks/list` was not re-tested).
  - *Guard* table L143–147 unchanged (L145's "codex 0.161.0 runs the call…" is a different row,
    not re-probed).
  - *Guard* bullet L155–157, being replaced: "- A malformed `craft.rules` file **may fail open** at
    runtime — the observed runtime" / "error reads like unrecognised rules are simply not applied,
    not that the whole" / "binary refuses to run." — 0.162.1 falsifies "not that the whole binary
    refuses to run" for `codex exec` (it refuses to start).
  - *Usage*, L185–187: "(loaded by reference via the `craft` plugin entry above)" on L187 →
    "(loaded through the `$CODEX_HOME/skills` symlinks above, since codex does not load them by
    reference)". It contradicts L48 today. Reflow L185–192 only as far as the new length needs.
  - The README never names `assertRulesIntegrity`; do not add it (ADR-576 applies to surfaces
    that already describe the check).
- `adapters/codex/test/native-surface.test.js` — `describe('README.md — honesty pins')` from
  L307; `README_PATH` constant at L13. Existing pins that must stay green unchanged (regexes
  quoted plain): git -C (L308–312), "fail open"/i (L314–318), "not measured"/i, the
  dangerously-bypass-hook-trust flag name, the CODEX_HOME skills path, "trust"/i plus
  "silently no-ops|silent no-op"/i (L337–342), the ephemeral flag name, the dot-slash
  marketplace pins (L350–375), the scriptable-trust pin (L377 on). Add the new `it` right after
  the "fail open" pin (after L318).

Read-only: the hygiene loops in the same test file (L277–305) cover README.md — no ADR/part/backlog
number, no `` !`…` ``, no bare `${CLAUDE_PLUGIN_ROOT}`; version strings pass. scripts/ci.sh runs an
advisory prose-lint over touched markdown outside docs/contributing — keep the edits declarative.
Evidence for every re-pin is the record section Part 2 created (`## Re-probe — codex-cli 0.162.1`
in docs/contributing/specs/codex-poc-record.md).

### TDD steps

1. **RED** — in `describe('README.md — honesty pins')`, after the `fail open` pin, add:
   ```js
   it('Given README.md, when scanned, then it states the launch path refuses to start on a malformed .rules file', () => {
     const sut = readFileSync(README_PATH, 'utf8');

     assert.match(sut, /refuses?\s+to\s+start/i);
   });
   ```
   Fails because the README today says only "not that the whole binary refuses to run" — no
   "refuse(s) to start" anywhere.
2. **GREEN** — replace the L155–157 bullet with (ADR-255's "**may fail open** at runtime" kept
   verbatim at the start):
   ```
   - A malformed `craft.rules` file **may fail open** at runtime, so treat it as fail open.
     On codex 0.162.1 the outcome depends on how codex is driven: `codex exec`, this
     binding's launch path, refuses to start, so the run stops loudly; the app-server
     thread/turn path logs a warning, skips the rules, and runs the command anyway. The
     interactive TUI was not probed.
   ```
   Then apply the L31–33, L48, L95–96 and L187 edits from *Context*. Run
   `node --test adapters/codex/test/native-surface.test.js` — the new pin and every existing pin
   green.
3. **REFACTOR** — `grep -n '0\.145\.0\|0\.162\.1\|by reference' adapters/codex/README.md` and
   confirm: 0.162.1 appears only at the four re-pinned spots; L41's 0.145.0 trust-key pin is
   intact; no sentence still says the shared skills load by reference.

### Gate

```
node --test adapters/codex/test/native-surface.test.js
git diff --no-ext-diff adapters/codex | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(codex): re-pin the codex adapter README to 0.162.1 and split the malformed-rules bullet by surface`

## Part 4 — BACKLOG: amend the three codex entries and open the two follow-ups

### Context

File this part edits: `BACKLOG.md` (1417 lines). All three amended entries sit under
`### Open (scoped 2026-07-20 — follow-ups surfaced by the codex binding, not yet scheduled)`
(L1053). Anchors re-verified on this tree (the design's L1088/L1104–1109 are now L1093/L1106–1111):

- **Hook-trust entry**, L1055–1091. Title L1055–1056 ("…scriptable trust landed 2026-07-31 on
  codex 0.145.0.**") stays. Two bullets: L1061–1068 (DELIVERED, over-blocking guard) and
  L1069–1091 (MITIGATED, not closed; its last line L1091 ends "…so the regression cannot
  return."). Append a third bullet after L1091.
- **By-reference entry**, L1093–1111. Title L1093–1094: "**Prove craft's shared skills load by
  reference on codex — re-probed 2026-07-31; STILL DISPROVEN,** / **stays OPEN (codex-0.145.0
  limitation).**". The 0.145.0 paragraph L1106–1111 ("**Re-probe on 0.145.0 (2026-07-31):
  unchanged — re-pinned 0.144.6 → 0.145.0.** … re-check on the next minor version.") is the model
  to copy and stays. Append a new paragraph after L1111.
- **`.rules` entry**, L1157–1165. Title L1157: "**Malformed `.rules` execpolicy fails OPEN at
  runtime — CONFIRMED + mitigated 2026-07-21**"; L1158–1161 the binary-string evidence; L1161–1165
  the mitigation, whose "— a hermetic, scriptable install/launch precondition that catches a
  voided rules file before relying on the layer" (L1163–1164) is falsified (nothing calls it).
  Followed by a blank line and the pi-stryker entry (L1167), which is untouched.
- **New section** goes at L177: after `## Candidate phases (un-PRD'd — promoted from parked)`
  (L174) and its one-line intro (L176), before the newest existing run-scoped section
  `### Open (scoped 2026-10-14 — follow-ups surfaced by the stryker-9-upgrade run, not yet
  scheduled)` (L178). Run-scoped sections are newest first. Shape to copy: L178–203 (a bold title
  sentence, then a prose paragraph with proof and a fix/next-step line).

Gates that read this file: scripts/backlog-lint.sh (asserts only `## Status`, `## Candidate
phases`, `## Parked`, `### Condition-gated`, `### Closed` — none move), intention-lint (checks
only the `> SoT —` pointer block at L8 — untouched), test/backlog-lint.test.js,
test/intention-lint-ci.test.js, and the advisory prose-lint. Evidence for every paragraph is the
record section from Part 2 and the design matrix (docs/contributing/design/codex-0162-reprobe.md
L27–75).

### TDD steps

No behaviour changes; BACKLOG is a ledger with structural gates only.

1. **GUARD (gate-first)** — `bash scripts/backlog-lint.sh BACKLOG.md` and
   `node --test test/backlog-lint.test.js test/intention-lint-ci.test.js` pass today; they must
   pass after the edit.
2. **GREEN — hook-trust entry**: append after L1091:
   ```
   - **Re-confirmed 2026-10-15 on codex 0.162.1 (codex-0162-reprobe).** The untrusted-hook
     fail-open reproduced: with the template `[[hooks.PreToolUse]]` block copied verbatim and
     `trust-hook.js --check` reporting `from=untrusted` (exit 1), `codex exec` ran
     `git diff > OUT.txt` (exit 0, `OUT.txt` 101 B) and the JSONL stream carried zero hook or
     warning items. `bin/trust-hook.js` then worked end to end: trust written (exit 0, the same
     `sha256:38713365…` hash as on 0.161.0), `--check` reported trusted/noop, a re-run left
     `config.toml` byte-identical, `git diff > OUT.txt` was blocked (`OUT.txt` absent, the guard's
     `--no-ext-diff` reason) and `git diff --no-ext-diff > ALLOWED.txt` ran (101 B, a real diff).
     The fail-open is still unchanged codex behaviour, so the entry stays MITIGATED, not closed.
   ```
3. **GREEN — by-reference entry**: title → "…on codex — re-probed 2026-10-15; STILL DISPROVEN,
   stays OPEN (codex-0.162.1 limitation).**" (keep the rest of the title sentence). Append after
   L1111, separated by a blank line:
   ```
   **Re-probe on 0.162.1 (2026-10-15): unchanged — re-pinned 0.145.0 → 0.162.1.**
   `codex plugin marketplace add ./adapters/codex` plus `plugin add` for both entries: both cached
   `.codex-plugin/plugin.json` are `{description, name}`, `skills` and `hooks` dropped. Through the
   app-server `skills/list` method (`forceReload: true`): **0 of 19** shared skills load by
   reference, **19 of 19** load via the symlink fallback (registered as `craft:<name>`, scope
   `user`). The symlink fallback stays documented as required, not optional. "Load by reference"
   is not achievable on codex 0.162.1; re-check on the next minor version.
   ```
4. **GREEN — `.rules` entry**: title L1157 → "**Malformed `.rules` execpolicy — treat as fail
   open: on 0.162.1 the app-server path fails open and `codex exec` refuses to start — recorded
   2026-07-21, re-probed 2026-10-15**". In L1161–1165 replace "and refuses on any drift
   (malformed included) — a hermetic, scriptable install/launch precondition that catches a voided
   rules file before relying on the layer." with "and refuses on any drift (malformed included).
   It is an exported, unit-tested check with no caller in the binding: it protects only when
   something invokes it." Keep the rest. Append after L1165, separated by a blank line:
   ```
   **Re-probe on 0.162.1 (2026-10-15): split by surface.** The 2026-07-21 verdict rested on the
   binary string alone; no runtime side effect was recorded. On 0.162.1, ground-truthed by side
   effect (`git clean -f` against an untracked `VICTIM.txt`, the deployed `craft.rules` with its
   last line `)` removed): `codex exec`, this binding's launch path, exits 1 at startup with
   `Error loading rules: … starlark error`, emits no events, and the file survives (fails closed,
   3/3); the app-server thread/turn path emits a `configWarning` (`Error parsing rules; custom
   rules not applied.`), runs the command, and the file is deleted (fails open, 3/3). With the
   well-formed file both paths block. The interactive TUI was not probed. Treat a malformed rules
   file as fail open. Evidence: `docs/contributing/specs/codex-poc-record.md`,
   *Re-probe — codex-cli 0.162.1*.
   ```
5. **GREEN — new section** at L177 (blank line on each side):
   ```
   ### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet scheduled)

   **Does the interactive codex TUI apply a malformed `.rules` file like `codex exec` or like the
   app-server?** On codex 0.162.1 a malformed `$CODEX_HOME/rules/craft.rules` makes `codex exec`
   refuse to start (fails closed, 3/3) while the app-server thread/turn path skips the rules and
   runs the command (fails open, 3/3); record: `docs/contributing/specs/codex-poc-record.md`,
   *Re-probe — codex-cli 0.162.1*. Which path the TUI takes was not probed. How to prove it: in a
   throwaway `CODEX_HOME`, deploy the malformed rules, drive the TUI to run `git clean -f`
   against an untracked file, and check whether the file survives. Question only; no fix is
   scoped.

   **Should a launch or install path call `assertRulesIntegrity`?**
   `adapters/codex/src/execpolicy-rules.js` exports it and
   `adapters/codex/test/execpolicy-rules.test.js` tests it, but `grep -rn assertRulesIntegrity`
   matches nothing else: no bin, launch path or install step runs it, so a drifted or malformed
   deployed rules file is caught only when someone invokes the check. The design that introduced
   it (`docs/contributing/design/harden-prove-codex-binding.md`) asked for a launch precondition,
   and none was wired. Open question: wire it into a launch or install path, or keep it on
   demand. Question only; no fix is scoped.
   ```
6. **REFACTOR** — confirm the 0.145.0 paragraphs of the hook-trust and by-reference entries and
   the 2026-07-21 `.rules` evidence are still present (older pins kept); no new ADR number was
   introduced; re-run the step-1 gates.

### Gate

```
bash scripts/backlog-lint.sh BACKLOG.md
node --test test/backlog-lint.test.js test/intention-lint-ci.test.js
git diff --no-ext-diff BACKLOG.md | grep -nE '/Users/|/home/'   # must print nothing
L="$(mktemp)"; bash scripts/ci.sh > "$L" 2>&1; echo "exit=$?"; grep -nE '^# fail|^ci: |^ *not ok' "$L" | head -20   # expect exit=0, every "# fail 0"
```

### Commit

`docs(backlog): record the codex 0.162.1 re-probe and open its two follow-ups`
