# Design — codex 0.162.1 re-probe: skills-by-reference re-pinned, hook-trust fail-open re-confirmed, malformed-rules fail-open split by surface

> Brief: re-probe the codex binding on codex-cli 0.162.1 (last pinned 0.145.0 for these rows;
> 0.161.0 for the hook-runtime rows). Re-check, do not fix: (1) shared skills by reference,
> (2) the untrusted-hook silent no-op, (3) the malformed `$CODEX_HOME/rules` fail-open. Outcome is
> probe-record, README and BACKLOG updates plus a version re-pin. Skills by reference still fails,
> so the "symlink route required" rule stands and no ADR is needed to drop it.
> Status: draft → self-reviewed ×3

---

## Context

Three codex-binding rows are re-checked on the installed CLI:

| Row | Where it lives today | Last pin |
|---|---|---|
| Shared skills load by reference | `BACKLOG.md` L1088–1109 (OPEN, "re-check on the next minor version"); `docs/contributing/specs/codex-poc-record.md` L114, open-rows row 1 (L324), section L431–446; `adapters/codex/README.md` L31–59 | 0.145.0 |
| Untrusted hook silently no-ops (mitigated by `adapters/codex/bin/trust-hook.js`) | `BACKLOG.md` L1055–1086; record L139–140, row 0 (L323); README L93–137 | 0.145.0 (trust-hook end to end: 0.161.0) |
| Malformed `.rules` fails open (mitigated by `assertRulesIntegrity`) | `BACKLOG.md` L1157–1165; record L185–188, row 3 (L326); README L146, L155–157; `adapters/codex/craft.rules` L8–9 | 2026-07-21; recorded evidence is a binary string only, with no runtime side effect recorded |

The orchestrator ran the probe live on 2026-10-15. **This design records that evidence and does
not re-derive it. No part of it is designed from memory of codex.** The designer added two
read-only facts without running codex: the installed npm package version, read from the package's
`package.json`, and a `node` check of `assertRulesIntegrity` against the probed malformed text.

### Pinned matrix — codex-cli 0.162.1, 2026-10-15

**Method.** One throwaway `HOME`/`CODEX_HOME` (`<throwaway>`), every codex call wrapped, including
`--version`. Isolation: `find ~/.codex -newer <marker>` → **0 entries**, and 185 entries landed in
the throwaway. `--dangerously-bypass-hook-trust` was never used. Every block was verified by its
ground-truth side effect, never by exit code. Target repo: a `git init` throwaway with one modified
tracked file.

**Credentials — the rotation caveat came true.** The copied `auth.json` returned HTTP 401
`Could not parse your authentication token`. The operator's real `~/.codex/auth.json` was last
written 2026-07-31, the day of the 0.145.0 probe, which used up that refresh token. This is the
failure the record's *Isolation-method caveat* (L497–508) predicted. The fix: the operator ran
`codex login` **inside** the throwaway `CODEX_HOME`. That needs the browser flow, because
device-code sign-in is off for this account unless it is enabled in ChatGPT Security Settings. The
real home was never touched and never rotated again.

| # | Probe | Observation (0.162.1) | Verdict |
|---|---|---|---|
| 1 | Identity | `codex-cli 0.162.1`. Vendored binary at `…/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`, the same layout as 0.145.0. Designer read (no codex run): npm `@openai/codex` `package.json` `"version": "0.162.1"`, platform package `0.162.1-darwin-arm64`. The binary and the package agree | CONFIRMED |
| 2a | Plugin install | `codex plugin marketplace add ./adapters/codex`, then `plugin add craft-codex@craft-codex-marketplace` and `plugin add craft@craft-codex-marketplace`. The cached `.codex-plugin/plugin.json` for **both** is `{description, name}`: `skills` and `hooks` dropped | UNCHANGED vs 0.145.0 |
| 2b | Skills by reference | App-server `skills/list` with `{"cwds":[<worktree>],"forceReload":true}`: **0 of 19** shared skills (6 in total: `craft-codex:craft-run` at scope user, plus 5 system skills) | DISPROVEN |
| 2c | Symlink fallback | `ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>` ×19: **19 of 19**, registered `craft:<name>`, scope `user`, paths resolving to the repo | CONFIRMED |
| 2d | `forceReload` | Present in the 0.162.1 generated schema `SkillsListParams`. The 0.145.0 record never captured the `skills/list` params, so this is a first observation, not a delta | CONFIRMED (schema) |
| 3 | Untrusted hook | Template `[[hooks.PreToolUse]]` block copied verbatim into the throwaway `config.toml`, `CRAFT_ROOT=<worktree>`. `trust-hook.js --check` → exit 1, `from=untrusted`. `codex exec --json -s workspace-write -C <target>` was told to run `git diff > OUT.txt`. The command ran (`/bin/zsh -lc 'git diff > OUT.txt'`, exit 0), `OUT.txt` exists (101 B), and the JSONL stream has **zero** hook or warning items | fail-open REPRODUCED |
| 4a | Trust write | `trust-hook.js` → exit 0, `trusted … from=untrusted hash=sha256:38713365…`, the same hash as the 0.161.0 row | CONFIRMED |
| 4b | Check + idempotence | `--check` → exit 0 `from=trusted action=noop`. Re-run → exit 0 `already trusted`. `config.toml` byte-identical (shasum unchanged) | CONFIRMED |
| 4c | Trusted BLOCK | `git diff > OUT.txt` → `OUT.txt` **absent**. The agent reports the call blocked by craft-guard, which requires `--no-ext-diff`. No `command_execution` item | denied |
| 4d | Trusted ALLOW | `git diff --no-ext-diff > ALLOWED.txt` → 101 B, a real unified diff | allowed |
| 5a | Rules deployed, well-formed (control) | `adapters/codex/craft.rules` → `$CODEX_HOME/rules/craft.rules`, with the hook block removed so only the rules are in play. `codex execpolicy check` → `forbidden` (matchedPrefix `git clean`) | CONFIRMED |
| 5b | Control, `codex exec` | Told to run `git clean -f`: the untracked `VICTIM.txt` **survived** | rules enforce |
| 5c | Control, app-server | `thread/start` (`approvalPolicy` never, sandbox workspace-write) + `turn/start`: `VICTIM.txt` **survived** ("blocked by … safety policy") | rules enforce |
| 5d | Malformed, `execpolicy check` | Last line `)` removed (a starlark parse error at line 15) → exit 1 | hard error |
| 5e | Malformed, `codex exec` | **3/3** exits 1 at startup with `Error loading rules: <path>:15: starlark error: … Parse error`. Zero JSONL events, `VICTIM.txt` survived | **FAILS CLOSED** (refuses to start) |
| 5f | Malformed, app-server thread/turn | **3/3** `configWarning` notification `{"summary":"Error parsing rules; custom rules not applied.", …}`, then `git clean -f` ran and `VICTIM.txt` was **deleted** | **FAILS OPEN** |
| 5g | Binary string | `Error parsing rules; custom rules not applied.` still sits beside app-server code | CONFIRMED (string) |
| 5h | Interactive TUI | Whether the TUI goes through the app-server path was **not probed** | DEFERRED |
| 5i | Integrity check | Designer read (no codex run): `assertRulesIntegrity(<craft.rules minus line 15>)` throws `integrity check failed`; `assertRulesIntegrity(<committed craft.rules>)` returns `{ intact: true }` | CONFIRMED (hermetic) |

**What row 5 changes.** The 2026-07-21 verdict "malformed `.rules` fails OPEN at runtime" was
planned as a `codex exec` run (`docs/contributing/plan/harden-prove-codex-binding.md` Part 9).
But the only evidence recorded for it, in BACKLOG L1158–1161 and record row 3, is the binary string
in 5g. Nothing records a runtime side effect. On 0.162.1 the verdict holds on **one** observed
surface (5f) and is false on the other (5e). That other surface is exactly the one the 2026-07-21
probe planned to use. The binding's own launch posture is
`codex exec`: `adapters/codex/src/launch-args.js` `buildLaunchArgs` documents its argv as
`execFile('codex', ['exec', ...args, prompt])`, and the README *Usage* section is
`codex exec "/craft-run …"`. On that path codex now refuses to start, so a malformed rules file
fails closed there, loudly, and stops the whole run.

### Facts found while mapping the change (each with its proof)

- **`assertRulesIntegrity` has no production caller.** `grep -rn assertRulesIntegrity` over the
  repo matches only its definition (`adapters/codex/src/execpolicy-rules.js` L92) and
  `adapters/codex/test/execpolicy-rules.test.js`. No bin, launch path or install step invokes it.
  The design that introduced it (`docs/contributing/design/harden-prove-codex-binding.md` L422–428)
  asked for a launch precondition, but none was wired. So "mitigated by `assertRulesIntegrity`"
  (BACKLOG L1161–1164, record row 3) overstates the case: the check exists, and nothing runs it.
- **No install doc deploys `craft.rules`.** `$CODEX_HOME/rules` is named only in the record (L326)
  and BACKLOG (L1158). Neither `adapters/codex/README.md` nor `config.template.toml` tells the
  operator to copy `craft.rules` there. The execpolicy layer is active only if an operator deploys
  it by hand.
- **The README contradicts itself on by-reference loading.** L48 says the 19 shared skills do NOT
  load by reference. *Usage* L185–187 says the run procedure is "loaded by reference via the
  `craft` plugin entry above". 2b falsifies L187 again on 0.162.1.
- **`craft.rules` L8–9 is falsified for the launch path.** "A malformed .rules file does not fail
  closed" is false on `codex exec` (5e). The source of that text is `DISCLOSURE_COMMENT` in
  `adapters/codex/src/execpolicy-rules.js` L17–25. The JSDoc at L77–86 says "runs the command
  anyway (pinned live against the codex binary)". The refusal message at L96 says "codex fails OPEN
  on a malformed rules file". All three state as a universal what only 5f observed.

### Constraints already decided

- **ADR-320**: the poc record appends a dated `## Re-probe — codex-cli <v>` section and corrects
  **only** the rows the re-probe falsified, each named by version. Rows not re-probed keep their
  pins. This settles how the record changes, so it is not a candidate.
- **ADR-255** ships four guard statements verbatim, not softened. Statement (b) is "a malformed
  `.rules` file **may fail open** at runtime". A rewording may sharpen it but must not drop or
  soften the fail-open posture. `adapters/codex/test/native-surface.test.js` L314–318 pins
  `/fail open/i` in the README, and `adapters/codex/test/execpolicy-rules.test.js` L51–58 pins it
  in the generated rules text.
- **Identity rows re-pin when observed.** That is the 0.145.0 precedent
  (`docs/contributing/design/codex-0145-limitation-reprobe.md` Part 5). The binary, the npm package
  and the vendor path were all observed on 0.162.1, so record L17, L18, L19 and L21 re-pin. This is
  settled, not a candidate.
- **No provenance refs in authored adapter surfaces.** `native-surface.test.js` L278–305 runs the
  hygiene loops over `authoredSurfaces()` (README, `config.template.toml`, `hooks.json`,
  `craft.rules`, the manifests, the entry skill). Version strings are allowed, because
  `PROVENANCE_REF_RE` does not match them, while ADR, part and backlog numbers are not.
- **README corpus counts are gated.** `test/readme-drift.test.js` L98 runs `scripts/readme-drift.sh`
  over the live tree inside `scripts/ci.sh`. `engine/src/readme-drift-main.js`
  `corpusCountFindings` recounts the `.md` files behind `README.md` L200–201 ("67 design docs",
  "66 parted plans", "572 ADRs"). Any commit that adds a doc must bump its count in the same commit.
  This design's own commit bumps design docs 67 → 68, following the precedent `5faf235`.

## Requirements

1. `docs/contributing/specs/codex-poc-record.md` gains `## Re-probe — codex-cli 0.162.1` holding
   the method, the credential row and rows 1–5i above, each marked `(0.162.1)`. Rows elsewhere in
   the record are amended only where 0.162.1 re-observed them, and the older pin stays next to the
   new one. No older observation is erased (ADR-320).
2. The new record section records the malformed-rules evidence by surface and version: `codex exec`
   fails closed (3/3), the app-server thread/turn path fails open (3/3), and the TUI is DEFERRED.
   ADR-320 requires this regardless of the candidates. The row-3 status cell and the summary
   wording elsewhere follow candidate 2. Whatever is chosen, "treat as fail open" stays the
   operative posture, because one observed surface fails open (ADR-255).
3. `adapters/codex/README.md` re-pins 0.145.0 → 0.162.1 **only** where the observation was re-made:
   L32 (cached manifest) and L48 (0/19 vs 19/19). L41 (trust key shape) keeps 0.145.0, because the
   0.162.1 evidence elides the key. The "symlink route required" rule stays word for word. L187
   stops claiming by-reference loading, which contradicts L48. The `.rules` bullet (L155–157) stops
   saying the binary does not refuse to run, which 5e falsifies. Its new wording follows candidate 2
   and still matches `/fail open/i`.
4. `BACKLOG.md`: the by-reference entry stays OPEN, re-pinned to 0.162.1 and still "re-check on the
   next minor version", with the 0.145.0 paragraph kept. The hook-trust entry gains a dated 0.162.1
   re-confirmation (fail-open reproduced, trust-hook end to end working). The `.rules` entry records
   the surface split. Exact shape per candidates 2–4.
5. Nothing claims a fix. No codex behaviour is changed, and no trust or rules wiring is added. Both
   upstream fail-opens (3 and 5f) are recorded as re-checked, unchanged codex behaviour.
6. No sentence written by this change claims that the rules integrity check runs at launch or
   install, because nothing calls it (Context, *Facts*). Whether the existing "mitigated" sentences
   get corrected follows candidate 4.
7. Every committed artifact uses repo-relative paths and placeholders (`<throwaway>`, `<worktree>`,
   `<repo>`, `<node-bin>`), never a home-rooted path.
8. `bash scripts/ci.sh` is green at every commit, including `design-lint`, `backlog-lint`,
   `readme-drift`, `intention-lint`, `docs-structure-lint` and the codex suite.

## Design

Up to five parts, one atomic commit each. Part 1 is conditional on candidate 1 and is the only part
that touches code. Parts 2–4 are documentation and ledger. Part 5 is conditional on candidate 5.
Parts run in this order so that each doc cites a record that already exists. No part adds a doc,
so none of them moves the README corpus counts. The planning commit (+1 plan, 66 → 67) and each
ADR commit (+n, from 572) refresh their own counts.

### Part 1 — make the generated rules disclosure version-free and true (conditional: candidate 1 = b)

**Context block**

- `adapters/codex/src/execpolicy-rules.js`:
  - `DISCLOSURE_COMMENT` (L17–25, a module `const` template literal). L24–25 is the stale clause.
  - The `assertRulesIntegrity(onDiskText)` JSDoc (L76–91). L78–81 claims "fails OPEN … runs the
    command anyway (pinned live against the codex binary)". The recorded evidence for that is the
    binary string, and on 0.162.1 `codex exec` does the opposite (5e).
  - The thrown message (L96) is `'… — codex fails OPEN on a malformed rules file, so refuse rather
    than run with silently-void enforcement'`.
  - `buildExecpolicyRules()` (L69–74) and the `assertRulesIntegrity` signature stay unchanged.
- `adapters/codex/craft.rules` is **generated**. Regenerate it, never hand-edit it:
  `node --input-type=module -e "import('./src/execpolicy-rules.js').then(m => process.stdout.write(m.buildExecpolicyRules()))" > craft.rules`,
  run from `adapters/codex/`. This is the recipe from `docs/contributing/plan/native-codex-binding.md`
  L982.
- Tests in `adapters/codex/test/execpolicy-rules.test.js`:
  - `describe('buildExecpolicyRules() — honesty disclosure')` (L51–58) pins `/git -c/i` and
    `/fail open/i`.
  - The drift guard (L60–68) asserts that the committed `craft.rules` equals the generator output.
  - `describe('assertRulesIntegrity() …')` (L70–96) matches only `/integrity check failed/`. Its
    title carries "(codex fails open)", which stays true as a posture.
  - The provenance sweep (L111–117) runs over the generated text.
- `adapters/codex/test/native-surface.test.js` L269 reads `craft.rules` into the hygiene loops.
- Mutation: `engine/stryker.conf.json` lists the file in `mutate[]` (L26) and the suite in
  `tap.testFiles` (L8). String-literal mutants of `DISCLOSURE_COMMENT` are killed by the drift guard
  and the `/fail open/i` pin.

**Change.** Replace the L24–25 clause with a version-free statement that holds on every observed
surface and claims nothing about the unprobed one, for example:

```
# A malformed .rules file must be treated as fail open: depending on how
# codex is driven it has been seen to refuse to start, and also to skip
# these rules with only a warning and run the command anyway.
```

The JSDoc and the L96 message get the same correction: codex *can* skip a malformed rules file and
still run commands, so refuse. The rules file carries no version, because a pin there would go stale
at every re-probe, and the version-pinned split lives in the record (Part 2).

RED first. Add a pin to the honesty-disclosure test that the generated text names the refuse-to-start
case (`/refuse to start/i`), and assert that it no longer carries the falsified universal
(`assert.doesNotMatch(sut, /does not fail closed/i)`). `/fail open/i` stays. Then go GREEN by editing
`DISCLOSURE_COMMENT` and regenerating `craft.rules`, and the drift guard goes green again.

**Side effect, stated.** A copy of the old `craft.rules` deployed under `$CODEX_HOME/rules/` stops
byte-matching the generator. Since nothing calls `assertRulesIntegrity` (Context), no running path
refuses because of this. The README *Configure* section never deploys the file, so no documented
install is affected.

### Part 2 — `docs/contributing/specs/codex-poc-record.md`: record the 0.162.1 re-probe

**Context block**: the exact rows in play.

| Location | Current | Change |
|---|---|---|
| L17 | `codex-cli 0.145.0` / CONFIRMED (0.145.0) | `codex-cli 0.162.1` / CONFIRMED (0.162.1) |
| L18 | `@openai/codex@0.145.0` | `@openai/codex@0.162.1` (designer's read-only `package.json` read) / CONFIRMED (0.162.1) |
| L19 | "Do they agree? **Yes**" | keep, re-confirmed 0.162.1 |
| L21 | install path, "Observed on 0.145.0" | append "unchanged on 0.162.1" |
| L49–58 | `### 0.145.0 re-probe method`, "this record carries **two** version pins at once" | the count is already false (0.161.0 added a third). Reword to "several version pins" and point at each dated re-probe section. Nothing else changes |
| L114 | Skills by reference? `DISPROVEN (0.145.0)` | `DISPROVEN (0.145.0; re-confirmed 0.162.1)`, same 0/19 vs 19/19 |
| L116 | Plugin install `CONFIRMED (0.145.0 — install exercised live)` | add "re-exercised 0.162.1 with `./adapters/codex`" |
| L139 | untrusted hook, `CONFIRMED (0.144.6; re-confirmed 0.145.0)` | add `; re-confirmed 0.162.1` |
| L140 | trust persisted, `CONFIRMED (0.145.0; write path exercised)` | add "re-exercised 0.162.1 via `bin/trust-hook.js`, byte-identical re-run" |
| L185–188 | `.rules` paragraph: runtime fail-open "unresolved … DEFERRED, … treat as fail-open" | keep the sentence as the 0.144.6 statement, and append the resolved split: on 0.162.1 `codex exec` refuses to start (fail closed, 3/3), the app-server thread/turn path warns and skips the rules (fail open, 3/3), the TUI is unprobed. Still treat as fail open |
| L310 heading + L312–319 | "rows 0–1: revisited 2026-07-31 on 0.145.0" | add "rows 0, 1, 3: revisited 2026-10-15 on 0.162.1" |
| L323 row 0 | OPEN, verification not wired | stays **OPEN**. Append: silent no-op re-confirmed 0.162.1, trust-hook end to end re-confirmed 0.162.1. Still no launch path calls `--check` |
| L324 row 1 | `DISPROVEN (re-pinned 0.144.6 → 0.145.0)` | `DISPROVEN (re-pinned 0.145.0 → 0.162.1)`, keeping the 0.145.0 sentence |
| L326 row 3 | `CONFIRMED fail-open (mitigated)`, binary-string evidence | status per candidate 2. Evidence: the 2026-07-21 verdict's recorded basis is the binary string (kept, pinned to its date), and 0.162.1 observed the split by side effect. Mitigation wording per candidate 4 |
| L497–508 *Isolation-method caveat* | the rotation is predicted | append one sentence: this happened on 2026-10-15, and the remedy that avoided a second rotation was logging in inside the throwaway (detail in the new section) |
| after L526 | — | new `## Re-probe — codex-cli 0.162.1` |

**New section shape.** It mirrors `## Re-probe — codex-cli 0.161.0` (L510–526): a method paragraph,
then a `| Probe | Result |` table with every result prefixed `**CONFIRMED (0.162.1).**`,
`**DISPROVEN (0.162.1).**` or `**DEFERRED (0.162.1).**`. The rows:

- credentials: the 401 on the stale copy, the 2026-07-31 last-write, login inside the throwaway
  via the browser flow, and device-code sign-in disabled by the account setting
- identity
- plugin install
- skills by reference (including `forceReload`, recorded as a first observation)
- symlink fallback
- untrusted hook
- trust write, check and idempotence
- BLOCK and ALLOW
- the rules controls (5a–5c)
- malformed rules on `execpolicy check`, on `codex exec` and on the app-server (5d–5f)
- the binary string
- TUI DEFERRED

The method paragraph carries the isolation proof (0 entries in the real home, 185 in the
throwaway), states that the bypass flag was never used, and states that every block was verified by
side effect. Where a row differs from the 0.145.0 or 0.161.0 sections, both stay, each pinned to its
version, as the 0.161.0 section already does.

**Not re-labelled**, because they were not re-probed on 0.162.1: the payload shape (L404–429), the
hook shell and quoting rows (0.161.0), the `hooks/list` auth question (L478, since the 0.162.1
throwaway was authenticated), the stdin-EOF row (L481–495), the non-0/2 exit fail-open (L526), the
execution, model, telemetry and sandbox ports, and the matcher semantics table (L165–183).

`intention-lint` reads the record as living corpus (`scripts/living-corpus.sh`). It has no
`subjects:` frontmatter, so the page is skipped rather than rejected. Do not add frontmatter.

### Part 3 — `adapters/codex/README.md`

**Context block**

- *Load* L31–33: "the cached `.codex-plugin/plugin.json` observed on 0.145.0" → "observed on
  0.145.0 and again on 0.162.1".
- *Load* L41–42: the trust-key shape "observed live on 0.145.0" stays as written, because the
  0.162.1 evidence does not show the key.
- *Load* L48: `**The 19 shared skills do NOT load by reference on Codex 0.145.0 (pinned live).**` →
  `… on Codex 0.162.1 (pinned live; first pinned on 0.145.0).**`. L52–55 (0/19 vs 19/19, "this IS the
  working path … required on every install, not a contingency") is kept verbatim.
- *Install-time hook trust* L95–99: "This was pinned live" gains "and re-confirmed on 0.162.1". The
  steps (L101–137) stay unchanged. Step 1's auth paragraph (L103–109) is not touched, because the
  0.162.1 probe did not re-test unauthenticated `hooks/list`.
- *Guard* table L146 stays unchanged. The bullet L155–157 ("**may fail open** at runtime — the
  observed runtime error reads like unrecognised rules are simply not applied, not that the whole
  binary refuses to run") is falsified for `codex exec`. Rewrite it to the candidate 2 wording,
  keeping the literal `fail open`.
- *Usage* L185–187: "(loaded by reference via the `craft` plugin entry above)" → "(loaded through
  the `$CODEX_HOME/skills` symlinks above, since codex does not load them by reference)". This
  corrects a falsified claim, not new prose.
- Pins in `adapters/codex/test/native-surface.test.js` `describe('README.md — honesty pins')`
  (from L307): `git -C`, `fail open` (L314–318), `not measured`, `--dangerously-bypass-hook-trust`,
  `$CODEX_HOME/skills`, `trust` + `silently no-ops|silent no-op` (L342), and the `./`-prefix pin.
  Every one of them survives. Under candidate 2 = (a), one pin is added in the same commit: the README names the
  launch-path refusal (`/refuses? to start/i`). Then removing the surface split fails CI and does
  not just degrade the prose.
- The hygiene loops (L278–305) cover `README.md`. Version strings pass them, and ADR, part or
  backlog numbers must not appear. `README.md` is read by the advisory prose gate in
  `scripts/ci.sh`, so keep the edits declarative.

### Part 4 — `BACKLOG.md`

**Context block.** Every entry sits under `### Open (scoped 2026-07-20 — follow-ups surfaced by the
codex binding, not yet scheduled)` (L1053). By the house convention, re-probes amend an entry in
place with a dated `**Re-probe on <v> (<date>): …**` paragraph and keep the older paragraph. The
model to copy is L1104–1109. `scripts/backlog-lint.sh` asserts only the five structural headings,
none of which move. `intention-lint` checks that the `> SoT —` pointer block resolves, and that
block is not touched.

- **L1088 by-reference entry.** Title: `re-probed 2026-07-31; STILL DISPROVEN, stays OPEN
  (codex-0.145.0 limitation)` → `re-probed 2026-10-15; STILL DISPROVEN, stays OPEN
  (codex-0.162.1 limitation)`. Add a `**Re-probe on 0.162.1 (2026-10-15): unchanged — re-pinned
  0.145.0 → 0.162.1.**` paragraph after L1109 with 2a–2c, keeping the 0.145.0 paragraph. The entry
  ends with "re-check on the next minor version".
- **L1055 hook-trust entry.** Append a dated bullet, `**Re-confirmed 2026-10-15 on 0.162.1
  (codex-0162-reprobe)**`, covering: the untrusted-hook fail-open reproduced (the command ran,
  `OUT.txt` 101 B, zero hook or warning items), and trust-hook end to end working (write, check,
  byte-identical re-run, BLOCK and ALLOW by side effect). The fail-open stays unchanged codex
  behaviour, so the entry's "MITIGATED, not closed" framing stands.
- **L1157 `.rules` entry.** Shape per candidate 3, wording per candidates 2 and 4.

### Part 5 — `adapters/README.md` *Probe records* (conditional: candidate 5 = b)

**Context block.** L12–20 hold the standing rule with three mitigations, and they point at the codex
record's caveat as the worked example. The change: add a fourth mitigation, "where the tool allows
it, log in inside the throwaway home instead of seeding a copied credential", and cite the 0.162.1
event. No other line moves.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | **The generated `craft.rules` disclosure (L8–9), plus the `assertRulesIntegrity` JSDoc and refusal message** | (a) leave the code alone and record the split in docs only; (b) Part 1: a version-free reword that holds on both observed surfaces, regenerate, add a RED pin; (c) a version-pinned surface split inside the generated file | **(b)** | The shipped artifact states "does not fail closed" as a universal, and on the binding's own launch path (`codex exec`, 5e) that is now false. (b) costs one constant, one regenerate and two assertions, and it stays true across re-probes. (c) makes every future re-probe a code change, because the byte pin turns a version string into churn. (a) is defensible if this run should stay docs-only, but it leaves a falsified sentence in a file operators copy. |
| 2 | **How the malformed-rules status is worded (record row 3, README L155–157, BACKLOG L1157)** | (a) surface-split and version-pinned: "on 0.162.1, `codex exec` refuses to start (fail closed, 3/3); the app-server thread/turn path warns and skips the rules (fail open, 3/3); the TUI is unprobed. Treat it as fail open"; (b) collapse to "fails open on at least one surface", without the split; (c) "fails closed on the binding's launch path", dropping fail-open from the binding's docs | **(a)** | (a) keeps ADR-255's fail-open posture, and the `/fail open/i` pins still match, while recording the one useful new fact: the binding's own path now refuses loudly. (b) throws away that fact. (c) overclaims, because the TUI is unprobed and an operator driving codex through any app-server client is exposed. It also softens a statement ADR-255 ships verbatim. |
| 3 | **Shape of the BACKLOG `.rules` entry update** | (a) amend in place: a dated `Re-probe on 0.162.1` paragraph, with the title's "fails OPEN at runtime" narrowed to the surface split; (b) a new OPEN follow-up for the app-server surface only, leaving the 2026-07-21 entry unchanged; (c) (a) plus a new run-scoped `### Open (scoped 2026-10-15 — follow-ups surfaced by the codex-0162-reprobe run, not yet scheduled)` section holding the two questions this probe left open: whether the TUI takes the app-server path (5h), and the unwired integrity check | **(c)** | (a) alone follows the house in-place convention but loses the open questions in a closed entry. (b) leaves the old entry asserting a universal it no longer supports. (c) is the house convention for follow-ups a run surfaces (every run-scoped `### Open (scoped …)` section from BACKLOG L178 down). It records the questions without acting on them, so no fix enters scope. If you want the BACKLOG edit kept to the amendment, choose (a). |
| 4 | **How docs describe the `assertRulesIntegrity` mitigation, given that nothing calls it** | (a) state it exactly: "an exported, unit-tested check with no caller in the binding; it protects only when something invokes it", and drop "install/launch precondition"; (b) keep the current "mitigated … install/launch precondition" wording; (c) wire it into a launch or trust path in this run | **(a)** | Proof that it is unwired: `grep -rn assertRulesIntegrity` matches only `execpolicy-rules.js` and its test. (b) writes a claim the code does not back into three re-touched surfaces. (c) is a fix, and the brief scopes this run to re-checking. Wiring it is a candidate follow-up (candidate 3c), not this change. |
| 5 | **Where the realised credential rotation and the login-inside-throwaway remedy land** | (a) the record only: a credential row in the 0.162.1 section plus one sentence in *Isolation-method caveat*; (b) (a) plus a fourth mitigation in `adapters/README.md` *Probe records* (Part 5); (c) a new BACKLOG entry generalising the remedy across bindings | **(a)** | Minimal and enough: the record is the worked example `adapters/README.md` already points at. (b) generalises from one binding. Logging in inside a throwaway is not available to every binding (cursor's auth is bound to the keychain), so the standing rule would need per-binding qualifiers. (b) is a reasonable call if you want the remedy to sit in the rule itself. |

## Test strategy

Only Part 1 changes code, and it follows strict TDD: Given/When/Then titles, AAA bodies, a `sut`
variable, RED before GREEN, and the full `scripts/ci.sh` green at every commit (pipe it to a file
and grep the summary).

- **Part 1 (if candidate 1 = b)**, in `adapters/codex/test/execpolicy-rules.test.js`. The
  honesty-disclosure test gains `/refuse to start/i` and
  `assert.doesNotMatch(sut, /does not fail closed/i)` (RED against the current constant).
  `/fail open/i` and `/git -c/i` stay. The drift guard (L60–68) and
  `assertRulesIntegrity(readFileSync(craft.rules))` (L79–84) go green only after regenerating. That
  is the proof the committed file matches the generator. Mutation: run Stryker on
  `adapters/codex/src/execpolicy-rules.js` alone, with the test corpus narrowed to its own suite
  (`execpolicy-rules.test.js`). Hand-check any surviving mutant against its full covering set, which
  includes the `craft.rules` read in `native-surface.test.js`.
- **Part 3**, in `adapters/codex/test/native-surface.test.js` `README.md — honesty pins`: one added
  pin, `/refuses? to start/i`, in the same commit as the README edit. Every existing pin (L307–350)
  must stay green unchanged. A pin that goes red means the edit dropped a mandated disclosure.
- **Doc and ledger gates**:
  - `scripts/design-lint.sh` on this file: the six headings.
  - `scripts/backlog-lint.sh` on `BACKLOG.md`.
  - `intention-lint` on the living corpus (the record and `BACKLOG.md`).
  - `docs-structure-lint`.
  - `readme-drift`, through `test/readme-drift.test.js`. This design's commit bumps design docs
    67 → 68. The planning and ADR commits bump their own counts.
- **Path hygiene.** Before each commit, grep the changed files for `/Users/` and `/home/`. The
  committed evidence uses placeholders only.
- **No live re-run.** The matrix in *Context* is the evidence. The record is not CI-gated, no test
  spawns real `codex`, and re-running the probe is an on-demand operator step in a throwaway
  `CODEX_HOME`.

## Out of scope

- **Fixing either upstream fail-open** (the untrusted-hook no-op and the app-server rules skip). They
  are codex behaviour, and this run only re-checks them.
- **Wiring `assertRulesIntegrity` or `trust-hook.js --check` into a launch or install path.** That is
  a fix, not a re-check (candidates 3c and 4).
- **Documenting a `craft.rules` deploy step.** No install doc deploys it today (Context, *Facts*).
  Adding one changes the binding's install surface.
- **Probing the interactive TUI's rules path (5h).** It stays DEFERRED and is recorded as such.
- **Re-pinning rows 0.162.1 did not re-observe**: the payload shape and its comments
  (`adapters/codex/src/git-guard-adapter.js` L57–64), the hook-shell and non-0/2-exit rows
  (`adapters/codex/hooks/craft-guard.js` L24, README L145/L169), the `hooks/list` auth row, and the
  README trust-key shape (L41).
- **`adapters/codex/src/launch-args.js` L68–70** ("confirmed on both 0.144.6 and 0.145.0") is
  still true, and adding 0.162.1 to a source comment is churn.
- **An ADR to drop the symlink fallback.** By-reference loading still fails (2b), so there is
  nothing to decide.
- Proven, one line each, not acted on:
  - `adapters/codex/test/native-surface.test.js:84`'s describe title says "shared craft skills load
    by reference", which 2b falsifies. The assertion itself (no `adapters/codex/skills/`) is sound.
  - `adapters/codex/README.md` and `config.template.toml` never tell the operator to deploy
    `craft.rules` to `$CODEX_HOME/rules` (proof: `grep -rn 'CODEX_HOME/rules'` matches only the
    record L326 and BACKLOG L1158), so the README's "Partial" execpolicy layer is off by default.
