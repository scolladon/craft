# Plan — the codex marketplace carries only `craft-run`: retire the inert `craft` entry

> Source: design doc `docs/contributing/design/codex-marketplace-entry-adr-252.md` · ADRs `635`
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

Already landed (do not redo): the design doc (028da34); ADR-635, the ADR-252/ADR-614 Status
flips, the BACKLOG.md rewording and the README ADR count (ee01bb4). User ratified D1 (a)
retire the entry, recorded in one ADR, and D2 (a) narrow scope. No live codex run: the
0.162.1 evidence is pinned in docs/contributing/specs/codex-poc-record.md (L332, L554).

Public surface: no new exported symbol anywhere. The test file gains one module-local
constant (`PLUGINS_DIR`), internal. No `src/` hunk in either part, so no mutation run.

## Part 1 — Retire the `craft` marketplace entry and pin README selectors to declared entries

### Context

Files this part edits or deletes (line numbers re-verified on this tree, 2026-10-18):

- `adapters/codex/test/native-surface.test.js` (499 lines, node:test + node:assert/strict).
  Conventions: Given/When/Then titles, AAA body, `sut` variable, printable-ASCII titles, no
  provenance refs (the file's own hygiene suite rejects `ADR-n`, `Part n`, `Pn`, `backlog #n`
  in the adapter surfaces, and the repo forbids them in tests). Imports L3:
  `existsSync, readdirSync, readFileSync, realpathSync` from `node:fs`; L5 `join, dirname`.
  After this part `REPO_ROOT` (L12, L23), `realpathSync` and `dirname` (L158-167 hooks-path
  describe) stay used — no dead import.
  - L19, current: `const CRAFT_PLUGIN_PATH = join(ADAPTER_DIR, 'plugins', 'craft', 'plugin.json');`
  - L23 `const SHARED_RUN_SKILL_PATH = join(REPO_ROOT, 'skills', 'run', 'SKILL.md');` (keep)
  - L59 `const SKILLS_SYMLINK_LINE = 'ln -s <repo>/skills/<name> $CODEX_HOME/skills/<name>   # once per shared skill';`
    (keep; also used at L495).
  - L133-139 `describe('plugins/craft-codex/skills/ — the entrypoint dir, ...')` uses
    `readdirSync(CRAFT_CODEX_SKILLS_DIR)` + `assert.deepEqual(sut, ['craft-run'])` — the pattern
    to copy for the plugins-dir test.
  - L141-156, current:

    ```js
    describe('plugins/craft/plugin.json — by-reference skills path', () => {
      it("Given the craft plugin manifest, when its declared skills path is resolved from the manifest's own directory, then it resolves to the repo-root skills/ directory", () => {
        const manifest = JSON.parse(readFileSync(CRAFT_PLUGIN_PATH, 'utf8'));
        const resolved = join(dirname(CRAFT_PLUGIN_PATH), manifest.skills);

        const sut = realpathSync(resolved);

        assert.equal(sut, realpathSync(join(REPO_ROOT, 'skills')));
      });

      it('Given the repository-root skills tree, when skills/run/SKILL.md is checked, then it exists', () => {
        const sut = existsSync(SHARED_RUN_SKILL_PATH);

        assert.ok(sut, 'skills/run/SKILL.md must exist so the entrypoint citation does not drift');
      });
    });
    ```

  - L169 `describe('marketplace.json — local file-backed, two entries', () => {`
  - L178-184 source test; L183 `assert.deepEqual(sut, ['local', 'local']);`
  - L186-192, current:

    ```js
    it('Given marketplace.json, when parsed, then it declares exactly the two entries craft and craft-codex', () => {
      const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));

      const sut = parsed.plugins.map((p) => p.name).sort();

      assert.deepEqual(sut, ['craft', 'craft-codex']);
    });
    ```

  - L255 `describe('entrypoint skill — plugins/craft-codex/skills/craft-run/SKILL.md', () => {`
    — destination of the moved `skills/run/SKILL.md` existence test.
  - L305-316 `function authoredSurfaces()`; L312, current:
    `{ label: 'plugins/craft/plugin.json', text: readFileSync(CRAFT_PLUGIN_PATH, 'utf8') },`
    It feeds the three hygiene describes at L318, L328, L338 (read at collection time, so a
    missing file is an ENOENT that kills every hygiene test).
  - L348 `describe('README.md — honesty pins', () => {` — destination of the new symlink-line pin;
    its tests read `readFileSync(README_PATH, 'utf8')` into `sut`.
- `adapters/codex/.claude-plugin/marketplace.json`, current (16 lines):

  ```json
  {
    "name": "craft-codex-marketplace",
    "owner": { "name": "craft" },
    "plugins": [
      {
        "name": "craft",
        "source": { "source": "local", "path": "./plugins/craft" },
        "description": "Shared craft skills. Installing this entry does NOT load them — codex drops the out-of-tree skills reference; symlink them into $CODEX_HOME/skills per the adapter README."
      },
      {
        "name": "craft-codex",
        "source": { "source": "local", "path": "./plugins/craft-codex" },
        "description": "Codex-native surface for craft. Installing this entry delivers the craft-run skill only — codex drops the hooks reference, so wire the enforcing PreToolUse guard by hand in config.toml per the adapter README."
      }
    ]
  }
  ```

  Target: delete L5-9 (the `craft` object and its trailing comma); the `craft-codex` object
  stays byte-identical.
- `adapters/codex/plugins/craft/plugin.json` — DELETE with `/usr/bin/git rm`. It is the only
  file under `adapters/codex/plugins/craft/`, so the directory goes too. `plugins/` then holds
  `craft-codex/` only.
- `adapters/codex/README.md`, current text of each target:
  - L12-13: `recognises; pass the marketplace ROOT directory, not the manifest file), then install`
    / `both entries with the `<plugin>@<marketplace>` selector:` → L13 becomes
    `its one entry with the `<plugin>@<marketplace>` selector:`.
  - L15-19 install block; delete L18 `codex plugin add craft@craft-codex-marketplace`
    (L16 marketplace add and L17 `codex plugin add craft-codex@craft-codex-marketplace` stay).
  - L25-29, current:

    ```
    `marketplace.json` declares two entries. `craft-codex` is this binding's own plugin
    directory, and it holds exactly one thing: the delegating `craft-run` entrypoint skill
    under `plugins/craft-codex/skills/`. Its manifest also declares
    `hooks: "../../hooks.json"` — a path pointing OUT of the plugin directory. `craft` is
    the second entry, whose `skills` field points at the repository-root `skills/` tree.
    ```

    replace with:

    ```
    `marketplace.json` declares one entry, `craft-codex`: this binding's own plugin
    directory, and it holds exactly one thing: the delegating `craft-run` entrypoint skill
    under `plugins/craft-codex/skills/`. Its manifest also declares
    `hooks: "../../hooks.json"` — a path pointing OUT of the plugin directory. No entry
    carries the shared skills: an entry whose `skills` field points at the repository-root
    `skills/` tree installs and loads nothing (below).
    ```

  - L50-53, current:

    ```
    `codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and, in doing
    so, drops the `craft` entry's out-of-tree `../../../../skills` reference — the cached
    plugin manifest carries no `skills` field, so `run`/`review`/`validation`/`init`/… are
    absent. Measured through the app-server's own skills-listing method: **0 of 19** load
    ```

    replace with (the 0/19 and 19/19 figures stay — they were measured with such an entry):

    ```
    `codex plugin add` COPIES a plugin into `$CODEX_HOME/plugins/cache/...` and, in doing
    so, drops an out-of-tree `skills` reference such as `../../../../skills` — the cached
    plugin manifest carries no `skills` field, so `run`/`review`/`validation`/`init`/… are
    absent. Measured, with such an entry installed, through the app-server's own
    skills-listing method: **0 of 19** load
    ```

    L54-56 (`without the symlinks below, **19 of 19** load with them. ...`) stay unchanged.
  - No other README line names the `craft` entry. The prose mentions `` `codex plugin add` COPIES ``
    at L31 and L50 are followed by a backtick, not a space, so the selector regex below does not
    match them.

Read-only references: docs/contributing/design/codex-marketplace-entry-adr-252.md §C (source of
these edits), docs/contributing/adr/635-the-codex-marketplace-carries-only-the-craft-run-entrypoint.md
(the decision), adapters/codex/plugins/craft-codex/plugin.json (untouched; its `hooks`/`skills`
fields are out of scope).

Leave as written: docs/contributing/specs/codex-poc-record.md L441-442 and L554 (dated probe
records of what was executed), adapters/antigravity/plugins/craft/ (a different binding),
older plan docs naming `plugins/craft/` (dated records).

### TDD steps

All test edits first, in `adapters/codex/test/native-surface.test.js`, then run
`node --test adapters/codex/test/native-surface.test.js > <scratch>/ns.txt 2>&1; tail -40 <scratch>/ns.txt`.
The RED is observed locally and never committed.

1. Constant swap: replace L19 with `const PLUGINS_DIR = join(ADAPTER_DIR, 'plugins');`, delete
   the L312 hygiene surface entry, and delete the L142-149 by-reference test (those are the only
   `CRAFT_PLUGIN_PATH` readers; removing all three together keeps the file loadable).
2. RED — replace the L141 describe with:

   ```js
   describe('plugins/ — the craft-codex plugin dir only', () => {
     it('Given the codex adapter plugins directory, when its entries are listed, then it contains exactly craft-codex', () => {
       const sut = readdirSync(PLUGINS_DIR);

       assert.deepEqual(sut, ['craft-codex']);
     });
   });
   ```

   Fails: `readdirSync` returns `['craft', 'craft-codex']` while `plugins/craft/` exists.
3. GUARD — move the `skills/run/SKILL.md` existence test (old L151-155, body and title unchanged)
   into the L255 entrypoint describe. Passes: `skills/run/SKILL.md` exists at the repo root; it
   guards the entrypoint's citation, not the retired manifest.
4. RED — L169 describe title → `'marketplace.json — local file-backed, one entry'`; L183 →
   `assert.deepEqual(sut, ['local']);`. Fails: two entries yield `['local', 'local']`.
5. RED — replace the L186-192 test with:

   ```js
   it('Given marketplace.json, when parsed, then it declares exactly the craft-codex entry', () => {
     const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));

     const sut = parsed.plugins.map((p) => p.name);

     assert.deepEqual(sut, ['craft-codex']);
   });
   ```

   Fails: names are `['craft', 'craft-codex']`.
6. GUARD — add, in the same marketplace describe, the drift guard:

   ```js
   it('Given README.md and marketplace.json, when every plugin add selector is collected, then they name exactly the declared entries of the declared marketplace', () => {
     const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));
     const declared = parsed.plugins.map((p) => `${p.name}@${parsed.name}`).sort();

     const sut = [...readFileSync(README_PATH, 'utf8').matchAll(/codex plugin add (\S+)/g)].map((match) => match[1]).sort();

     assert.deepEqual(sut, declared);
   });
   ```

   Passes today: README L17-18 install both declared entries. It turns red if the marketplace
   edit lands without the README L18 deletion (design E12) — that is why step 8 lands both.
   If the line exceeds a formatter limit, hoist the regex to a named module constant
   (`PLUGIN_ADD_SELECTOR = /codex plugin add (\S+)/g`) next to the other patterns at L40-59.
7. GUARD — add in `README.md — honesty pins` (L348):

   ```js
   it('Given README.md, when scanned, then it shows the shared-skills symlink line', () => {
     const sut = readFileSync(README_PATH, 'utf8');

     assert.ok(sut.includes(SKILLS_SYMLINK_LINE));
   });
   ```

   Passes: README L59 holds that exact line. It replaces the deleted by-reference test as the
   proof of where the shared skills come from.
   Expected run after steps 1-7: exactly 3 failures (steps 2, 4, 5); the hygiene describes pass
   (the dropped surface no longer reads the soon-deleted file).
8. GREEN — in one step: delete the `craft` object from `adapters/codex/.claude-plugin/marketplace.json`;
   `/usr/bin/git rm adapters/codex/plugins/craft/plugin.json`; apply the four README edits
   (L13, L18, L25-29, L50-53) from the Context block. Re-run the targeted suite: 0 failures
   (design E10 measured 148 pass on the same change set).
9. REFACTOR — none expected. Confirm `grep -n CRAFT_PLUGIN_PATH adapters/codex/test/native-surface.test.js`
   is empty and `ls adapters/codex/plugins` prints `craft-codex` only. If a local `.DS_Store`
   appears under `plugins/`, delete that untracked file, do not loosen the assertion.

### Gate

```
node --test adapters/codex/test/native-surface.test.js > <scratch>/ns.txt 2>&1; tail -20 <scratch>/ns.txt
bash scripts/ci.sh > <scratch>/ci.txt 2>&1; echo "exit $?"; tail -30 <scratch>/ci.txt
```

Both exit 0. `<scratch>` is a directory outside the working tree.

### Commit

`fix(codex): retire the craft marketplace entry`

Stage exactly `adapters/codex/.claude-plugin/marketplace.json`, `adapters/codex/README.md`,
`adapters/codex/test/native-surface.test.js` and the `git rm` of
`adapters/codex/plugins/craft/plugin.json`; `/usr/bin/git commit -m "fix(codex): retire the craft marketplace entry"`.

## Part 2 — State what the codex marketplace actually carries in the execution spec

### Context

- `docs/contributing/specs/execution.md` — a living page (scripts/living-corpus.sh enumerates
  `docs/contributing/specs/*.md`, so prose-lint and `node engine/bin/intention-lint.js` read it).
  L150-154, current (L149 and L155 are blank lines; leave them):

  ```
  **Native discoverable surface.** A local file-backed marketplace (`"source": "local"`) carries
  two plugin entries: `craft`, resolving the shared `skills/` directory **by reference** at the
  repo root (no adapter-local copy, so drift between the shared source and a copy is structurally
  impossible), and `craft-codex`, supplying this binding's own `hooks/`, `agents/`, and entrypoint.
  Installed via `codex plugin marketplace add` then `codex plugin add`.
  ```

  Replace those five lines with (design §D, D1 (a) text, verbatim):

  ```
  **Native discoverable surface.** A local file-backed marketplace (`"source": "local"`) declares
  one plugin entry, `craft-codex`, installed via `codex plugin marketplace add` then `codex plugin
  add`. Only the `craft-run` entrypoint arrives that way: `codex plugin add` copies the plugin into
  its cache and drops every out-of-tree reference. The shared `skills/` load through one
  `$CODEX_HOME/skills/<name>` symlink per skill (no adapter-local copy), the guard hook is wired by
  hand into `$CODEX_HOME/config.toml`, and the marketplace does not carry the role agents.
  ```

  The surrounding paragraphs (L146-148 `codex exec` shape; L156 artifact-is-the-handoff) stay.
  Do not cite ADR numbers in the new prose; the spec states behaviour.
- Read-only: adapters/codex/README.md after Part 1 (the same facts, L25-56).

### TDD steps

Docs-only part, no `src/` or test delta, so no RED/GREEN cycle.

1. GUARD — prose-lint and intention-lint over the living corpus inside `bash scripts/ci.sh`:
   green before the edit, and the replacement text was green in design E10.
2. GREEN — apply the L150-154 replacement above.
3. REFACTOR — `grep -n "two plugin entries\|by reference" docs/contributing/specs/execution.md`
   returns nothing for this section.

### Gate

```
bash scripts/ci.sh > <scratch>/ci.txt 2>&1; echo "exit $?"; tail -30 <scratch>/ci.txt
```

Exit 0.

### Commit

`docs(spec): state that the codex marketplace carries only the craft-run entrypoint`

Stage only `docs/contributing/specs/execution.md`.
