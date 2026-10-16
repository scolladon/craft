# Plan — native-surface-skills-title-fix

> Source: design doc `docs/contributing/design/native-surface-skills-title-fix.md` · ADRs none
> (the decisions phase was skipped: the design's Decision candidates table is empty.)
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

**How this plan applies them.** One part, zero RED→GREEN cycles, one edited file. The change
is the title string of one existing test: no `src/` delta, no new behaviour, so it is a
standalone test-only part with nothing to fold into. It needs a few tool calls, not 100.

**Deviation from the design.** Design R5 (remove the BACKLOG.md entry at L243–249) is NOT in
this part. In this repo the documentation phase owns the backlog change: the previous run
(6114371) landed its backlog edit as a separate `docs(<slug>): backlog flip` commit. This
plan covers R1–R4 and R6 only. The part must not touch BACKLOG.md.

**README corpus count.** The plan commit bumps README.md l. 200 from "[69 parted plans]" to
"[70 parted plans]" (test/readme-drift.test.js and `bash scripts/readme-drift.sh` check it
against the live tree). The part adds no design doc, plan or ADR, so it does not touch
README.md.

**Public surface.** None. The part introduces no exported symbol; it edits one string literal
in a test file. No barrel, registry, guide or README lists test titles.

**Pre-probed.** Before this plan was written, a `git archive HEAD` copy of this branch (HEAD
d6d9314) in a `mktemp` dir took the exact edit below:

- `node --test adapters/codex/test/native-surface.test.js` → `ok 1 - adapters/codex/skills/ —
  must not exist: shared craft skills live at the repository root and load through the
  $CODEX_HOME/skills symlinks, not by reference`, `# pass 132`, `# fail 0`;
- L84 compared byte for byte with the R1 string → identical;
- `grep -rn "shared craft skills load by reference'" adapters/codex` → no match, exit 1.
- test/source-hygiene.test.js (which scans `adapters/*/test/**` titles for provenance tokens
  and home-rooted paths) passes in the worktree, `# pass 141`, `# fail 0`. The new title
  carries no ADR number, requirement id, part number or absolute path. (In the archive copy it
  reports 5 failures because the copy is not a git repo; that is the copy, not the edit.)

## Part 1 — retitle the adapters/codex/skills/ native-surface check

### Context

- File to edit: `adapters/codex/test/native-surface.test.js`. Only line 84 changes. It is the
  first top-level `describe` in the file; the helpers `bodyOf`, `agentPath` and
  `sharedAgentPath` end at L82, and the next `describe` starts at L92
  (`plugins/craft-codex/skills/ — the entrypoint dir, never a copy of the shared tree`).
  `SKILLS_DIR` is `join(ADAPTER_DIR, 'skills')` at L11; leave it alone.
- Current block, L84–90:

  ```js
  describe('adapters/codex/skills/ — must not exist: shared craft skills load by reference', () => {
    it('Given the codex adapter tree, when checked, then adapters/codex/skills/ does not exist', () => {
      const sut = existsSync(SKILLS_DIR);

      assert.equal(sut, false);
    });
  });
  ```

- Exact new L84 (R1), byte for byte; `$CODEX_HOME` sits in a single-quoted JS string, so
  nothing interpolates it:

  ```js
  describe('adapters/codex/skills/ — must not exist: shared craft skills live at the repository root and load through the $CODEX_HOME/skills symlinks, not by reference', () => {
  ```

  The em dash is U+2014, same as the current line. Do not reflow: lines over 100 characters
  are already common in this file (L93 is 126, L101 is 177), and scripts/ci.sh runs
  `node --test` with no formatter or title lint.
- Byte-identical (R2): the `it` title, the `it` body and the assertion, L85–89. No other line
  in the file changes (R4).
- Why the new wording (read-only sources, do not edit): adapters/codex/README.md L189–191
  ("loaded through the `$CODEX_HOME/skills` symlinks above, since codex does not load them
  by reference") and docs/contributing/specs/codex-poc-record.md L115, L332 (0 of 19 shared
  skills load by reference; 19 of 19 through the symlinks). ADR-253 still requires
  adapters/codex/skills/ to be absent, so the assertion stays.
- Leave alone: L101 `plugins/craft/plugin.json — by-reference skills path` (Claude plugin,
  correct); adapters/copilot/test/native-surface.test.js titles (Copilot loads by reference);
  adapters/codex/README.md; the POC record; dated design/plan docs; BACKLOG.md (the
  documentation phase owns it, see the deviation note above); the ADR-253 title.
- Test-title rules the edit already satisfies: test/source-hygiene.test.js scans titles under
  `adapters/*/test/**` for provenance tokens (`ADR-?\d+`, `P\d+`, `Part\s+\d+`,
  `backlog #\d+`, `DC-\d+`) and home-rooted paths. The new title contains none.

### TDD steps

No RED: the change is the title of an existing test, so there is no new behaviour to fail
first, and breaking the code to watch it fail is forbidden.

1. GUARD — `node --test adapters/codex/test/native-surface.test.js` before the edit: the
   `adapters/codex/skills/ — must not exist: …` subtest passes (`# fail 0`) because
   adapters/codex/skills/ does not exist in the tree. Record the `# pass` count (132 at
   d6d9314).
2. GREEN — replace L84 with the exact R1 line from the Context block. Use an exact-string
   edit, not a regex over the file.
3. GUARD — the same command after the edit: still `# fail 0`, same `# pass` count, and the
   `ok` line prints the new title. It passes because only the title changed; the assertion
   still sees no adapters/codex/skills/.
4. Checks for R2–R4:
   - `git diff --no-ext-diff --numstat -- adapters/codex/test/native-surface.test.js` →
     `1	1	adapters/codex/test/native-surface.test.js`;
   - `git diff --no-ext-diff -U0 -- adapters/codex/test/native-surface.test.js` → one hunk
     `@@ -84 +84 @@`, one `-` line, one `+` line;
   - `git grep -n "shared craft skills load by reference'" -- adapters/codex` → no output,
     exit 1;
   - `git diff --no-ext-diff --name-only` → only adapters/codex/test/native-surface.test.js.
5. REFACTOR — none. The edit is one string literal.

### Gate

`bash scripts/ci.sh > <scratch>/ci.out 2>&1; echo $?` must print `0`. On non-zero, grep
`<scratch>/ci.out` for `not ok` / `fail` and read only those lines. `<scratch>` is a
`mktemp -d` directory outside the worktree. Never commit on a red gate.

### Commit

`test(codex): retitle the adapters/codex/skills/ native-surface check to the symlink reason`

Stage only adapters/codex/test/native-surface.test.js (`git add <that path>`); one-line
message, no body, no trailers.
