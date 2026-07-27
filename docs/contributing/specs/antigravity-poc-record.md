# Antigravity PoC — feasibility + contract-discovery record

> This document records the **Phase 0 feasibility gate** for a native Google Antigravity
> binding of the craft harness — the analog that was attempted for codex/copilot/opencode/pi.
> Facts are pinned against the **shipped artifact on this machine** (Antigravity 2.3.0 +
> Antigravity IDE 2.0.2), read from the real bundle and the real `language_server` binary,
> plus one isolated live self-report. Every row is CONFIRMED (observed), SOURCE (read from the
> shipped code/binary, not executed), or OPEN (not exercised; stated as unknown, never assumed).

> **Two verdicts, one record.** A **port-binding adapter** (the runnable, live-proven
> codex/copilot analog) is **NO-GO** — Antigravity has no headless execution port. A
> **customization declination** (craft's agents/skills/guard packaged for Antigravity's
> `.agents/` customization contract, driven by a human in the GUI) is **feasible and was
> built** at `adapters/antigravity/`; its deterministic seams are CI-gated, its live rows
> stay OPEN. No test spawns Antigravity.

## Verdict: **NO-GO** (2026-07-21)

**Antigravity 2.3.0 exposes no headless, scriptable, one-turn-and-exit agent invocation with
machine-readable output — the load-bearing execution port every existing craft binding is built
on (`codex exec --json`, `copilot -p --output-format json`, `opencode run --format json`, the pi
extension host).** Antigravity is a GUI-first agentic desktop product: an Electron "Hub"
application plus a separately-installed VS Code-fork IDE, both driving a local Windsurf-lineage
`language_server` (the "Cascade" engine) over a **CSRF-protected private HTTP RPC on a dynamic
localhost port**. There is no documented CLI contract to bind, no external turn/event schema to
parse, no way to spawn craft's nine role agents headlessly, and therefore no scriptable path on
which to run — let alone *prove* (Phase B) — a guard, skill-load, sandbox, or telemetry binding.

The internal agent framework is rich (hooks incl. `PreToolUse`, a permission/sandbox model,
subagents, a Markdown skill/plugin/rules customization contract, a trajectory store) — but all of
it is reachable **only when the GUI drives the agent**. A binding needs an execution port to
trigger those surfaces; that port is what is missing.

**Recommendation:** do not build the binding at 2.3.0. Re-open when Antigravity ships a headless
agent CLI with machine-readable output (see the BACKLOG condition-gated trigger).

## Probe method

The decisive evidence is **the shipped artifact itself**, which is stronger than a black-box
`--help` probe: the Electron shell is a 2 MB `app.asar` whose TypeScript-compiled source was
extracted and read directly (`dist/main.js`, `dist/languageServer.js`, `dist/paths.js`), and the
114 MB `language_server` was inspected by static string extraction. One **live** probe ran the LS
under the mandated isolation protocol (throwaway `HOME`, `env -i`, non-repo cwd, a background
`( sleep N; kill -9 $PID )` watchdog — macOS has no `timeout`). Isolation was **verified, not
assumed**: `find ~/.gemini -newer <marker>` returned empty after the probe (the real,
Google-authenticated state was untouched).

A full **GUI launch was deliberately NOT performed.** It cannot manufacture the missing scriptable
contract (headless mode only pipes raw stdin to the LS — see below), it requires interactive Google
OAuth, and it would write to the operator's real `~/.gemini`. Declining it is the honest,
protocol-respecting call; the blocker is a structural property of the shipped bundle, determinable
without executing the agent.

## Product identity

| Question | Answer | Status |
|---|---|---|
| Which product? | **Google Antigravity** — `com.google.antigravity`, "Antigravity - Agentic Desktop Application", `homepage: antigravity.google`, author Google. Gemini-based (Windsurf/Codeium "Cascade" lineage). | CONFIRMED |
| Bundle version | `/Applications/Antigravity.app` → **2.3.0** (Hub). `/Applications/Antigravity IDE.app` → **2.0.2** (`com.google.antigravity-ide`, a VS Code fork). | CONFIRMED |
| Language-server build (live) | `language_server --stamp` → `Built at CL: 947215217`, built 2026-07-13, from `//depot/branches/agy_ls_release_branch/2.3/google3`. Run isolated; real `~/.gemini` untouched. | CONFIRMED (live) |
| Competing/legacy CLI shadowing the name? | **No CLI at all.** `antigravity`, `ag`, `gemini`, `cascade`, `windsurf`, `codeium` — none on `PATH`, no Homebrew formula/cask, no npm global. A `gemini` CLI (the shared-`~/.gemini` sibling) is **not installed**, and would in any case be a *different product* (a Gemini-CLI binding), not Antigravity. | CONFIRMED |
| Install/agent path | Hub `Antigravity.app/Contents/MacOS/Antigravity` (Electron) spawns `Contents/Resources/bin/language_server` (114 MB Go binary). State under `~/.gemini/{antigravity,antigravity-ide,config,...}`. | CONFIRMED |

## Architecture (the decisive finding)

`dist/main.js` + `dist/languageServer.js`, read from the extracted asar:

- The Hub is an **Electron GUI app**. On launch it spawns `language_server` with
  `--standalone --override_ide_name antigravity --subclient_type hub --https_server_port <dynamic>
  --csrf_token <uuid> --app_data_dir <dir> --api_server_url https://generativelanguage.googleapis.com
  --cloud_code_endpoint https://daily-cloudcode-pa.googleapis.com --enable_sidecars`, then opens a
  `BrowserWindow` at `https://127.0.0.1:<port>/`. **The agent UI is a web app served by the LS**, and
  the LS is driven over a **CSRF-token-protected private RPC** (`/_agentapi/new-conversation`, seen
  in the LS strings). Auth is **interactive Google OAuth** (`accounts.google.com/o/oauth2/auth`).
- `HEADLESS` exists but is a **dev affordance, not an agent CLI**: gated by
  `ELECTRON_OZONE_PLATFORM_HINT=headless`, it skips `createWindow()` but still starts the LS server
  on a port, then merely `readline`-forwards **raw terminal stdin lines to the LS stdin**
  (`lsProc.stdin.write(line + '\n')`, logging `-> Forwarded input to Language Server`). Stdout carries
  only the port banner + OAuth URL + that log line — **no turn/event schema, no one-shot semantics,
  no `--prompt`, no JSON output.** There is nothing to parse and no documented protocol for what to
  write.
- The separate **IDE** (`Antigravity IDE.app`, VS Code fork) ships a launcher CLI at
  `Contents/Resources/app/bin/antigravity-ide` (product.json: `applicationName: antigravity-ide`,
  `serverApplicationName`, `tunnelApplicationName`). It is **not on PATH** and is a VS Code-style
  editor/server/tunnel launcher — **not** a headless agent runner (`code`-family CLIs open the GUI or
  a remote server; they do not run an agent turn to completion and exit).

## Surface-by-surface (the rows a craft binding needs)

| Surface | Finding | Status |
|---|---|---|
| **Headless one-turn-and-exit + machine-readable output** | **ABSENT.** Only a raw-stdin-pipe "headless" dev mode with a log-line-only stdout; no event schema, no `--prompt`, no `--json`. The only programmatic surface is the private CSRF RPC used by the web UI. **This is the hard blocker.** | SOURCE — **BLOCKER** |
| **Working-dir control** (`-C`/`--cwd`) | No CLI, so no headless cwd flag. Workspaces are opened in the GUI; the LS resolves customization roots relative to the opened workspace. | SOURCE |
| **Agent / subagent model** (craft's 9 roles, per-agent model/effort) | Subagents exist internally (`subagent` × 965 in LS strings; "JSON agents are not allowed" ⇒ Markdown agent defs). But there is **no external per-role spawn surface** and the model is fixed to Gemini via `generativelanguage.googleapis.com` — craft's per-role model/effort map has nowhere to bind. | SOURCE |
| **Guard / hook (deny-capable PreToolUse)** | A hook framework **exists**: LS strings include `"PreToolUse": [`, `session start hook`, `custom post-invocation hook`, `stop hook %s not registered` — Claude-shaped hook config. **Deny-capability and the real payload shape were NOT dumped** (the brief's `readFileSync(0)` payload-dump needs a live agent tool-call to trigger the hook, which needs the missing execution port + OAuth). Recorded as unknown, never assumed — precisely the assumed-schema trap the codex run warned about. | OPEN |
| **Plugin / skill / marketplace loading** | A **documented filesystem customization contract exists** (LS asset docs): customization roots (`.agents/` project-local + a global root) containing `plugins/<name>/` (with `mcp_config.json`), `skills/<skill_name>/` (`SKILL.md`), `rules/` + `GEMINI.md`/`AGENTS.md`; plus an in-app `marketplace`. craft's SKILL.md skills and rules could **plausibly** drop here — but this is consumed only during a GUI-driven agent run, and the exact install path/precedence was **not proven live**. | SOURCE / OPEN |
| **Sandbox / permission / execpolicy** | A permission + sandbox model exists internally (`permission` × 1033, `sandbox` × 644, `allowlist` × 192, `deny` × 150; `browserAllowlist.txt` in the app-data dir). No `execpolicy`-style external ruleset file was found. Not measured (no execution port to measure against). | SOURCE / OPEN |
| **Telemetry / rollout** | A **trajectory store** exists (`trajectory` × 5873, `CreateTrajectory`, `store not found for kind`, gorm/sqlite; `~/.gemini/antigravity/conversations/`, `brain/`, `code_tracker/`). It is the rollout analog — but it is populated **only by real GUI-driven runs**, and no token-bearing persisted record was captured (would require an authenticated run). | SOURCE / OPEN |

## What this means for the binding

A craft binding is, structurally, **an execution port plus surfaces the port lets you reach**. The
four existing bindings all bind a headless CLI turn and then register agents/guards/skills that
that turn honors, and *prove* each live by driving a real turn. Antigravity inverts this: the
surfaces exist, but there is no external turn to drive them. Consequences:

1. **The orchestrator cannot dispatch a phase.** craft shells out to a headless agent per phase;
   Antigravity offers nothing to shell to.
2. **Phase B cannot run.** Guard-denial, skill-load, sandbox-measurement, and rollout-capture proofs
   all require triggering a real agent tool-call — impossible without the execution port.
3. **A code-bearing binding would be an assumed-schema artifact** — exactly the fail-closed-on-
   everything, unit-green trap (`[[binding-dump-real-hook-payload]]`), and it would violate the
   "a binding isn't done until a live build dogfoods it end-to-end" rule
   (`[[binding-needs-live-construction-proof]]`). Shipping it would be dishonest.

## Rejected alternative — drive the private CSRF RPC

One could reverse-engineer the LS's `/_agentapi/*` HTTP surface on the dynamic localhost port and
scrape the per-launch CSRF token from process args. Rejected: it is an **undocumented, unstable,
GUI-coupled private API** (the opposite of the stable, documented headless contracts every other
binding targets), still requires interactive Google OAuth, still exposes no per-role spawn, and
would break on any release. Pinning it would pin an internal API, not a binding contract.

## Go / No-Go

**NO-GO at Antigravity 2.3.0 / IDE 2.0.2.** The customization half (agents-as-rules, SKILL.md
skills, `PreToolUse` hooks, `plugins/mcp_config.json`, trajectories) is genuinely present and would
make a strong binding *if* an execution port appears. It has not.

**Revisit trigger:** Antigravity ships (a) a headless agent subcommand that runs one turn to
completion and exits with machine-readable (JSON/JSONL) turn+tool events, OR (b) a documented,
supported local-API contract for driving an agent turn. Either unblocks Phase A/B; re-run this
gate first.

## Customization declination — BUILT (`adapters/antigravity/`)

The NO-GO above is for a *port-binding* adapter. Antigravity's customization contract, by
contrast, is real and documented — so craft's content was packaged onto it. This is a
declination a human drives inside the GUI (the Gemini agent invokes the `craft-run` skill and
follows the workflow itself), **not** a headlessly-runnable binding.

Contract pinned from the shipped `language_server` (not assumed):

| Surface | Pinned fact |
|---|---|
| Customization roots | project `<workspace>/.agents/` + global `~/.gemini/config/`; within: `agents/`, `skills/<name>/SKILL.md`, `plugins/<name>/` (`hooks.json`, `mcp_config.json`), `rules/` + `GEMINI.md`/`AGENTS.md`. |
| Hook config | top-level `PreToolUse: [{ matcher, hooks: [{type:"command", command}] }]` in `plugins/<name>/hooks.json`; working dir = that dir; hooks block synchronously; `type:"command"` only. |
| Hook payload (stdin) | `{ "toolCall": { "name": "...", "args": {...} } }`. |
| `run_command` args | `{ "CommandLine": "<shell cmd>", "Cwd": "<dir>", "Blocking": bool, ... }` — the command is in **`CommandLine`** (PascalCase), pinned from a live tool-call example embedded in the binary. The codex-lesson trap: nobody would guess this field. |
| Deny mechanism | hook writes `{ "decision": "allow"\|"ask"\|"deny", "reason": "..." }` to **stdout**; `"deny"` hard-blocks; benign path emits nothing (normal flow proceeds). |
| Agents | Markdown agent customizations (`"JSON agents are not allowed"`). |

What was built + CI-gated (`adapters/antigravity/test/`, injected-dependency unit tests, no
live spawn):

- 9 role agents `agents/craft-*.md`, bodies byte-identical to the shared `agents/*.md`
  (name + description frontmatter only — a per-agent model key is NOT fabricated; Gemini-fixed,
  override key unpinned).
- Guard: `src/antigravity-guard-adapter.js` reshapes `toolCall.args.CommandLine`/`.Cwd` and
  **reuses** `engine/src/guards/{tool-call-guard,git-ext-diff-predicate}.js` (never
  re-implemented); `hooks/craft-guard.js` emits the `decision:deny` stdout wire. **Both
  directions pinned:** denies `git diff`/`git show` without `--no-ext-diff`, **allows** `echo`
  and `npm test` (the codex fail-closed-on-everything check). Fails **closed** with a visible
  reason on any unrecognised payload (the opencode fail-open lesson inverted).
- Entrypoint skill `skills/craft-run/SKILL.md`; `plugins/craft/hooks.json`; README +
  `config.template.json` documenting the posture.

Ports deliberately NOT built (no pinnable contract — omission is honest, not oversight):
Execution/launch-args (no headless CLI), a model-tier map (Gemini registry unpinned), and the
acceptance probe (`runProbeHarness` needs a real runner to drive; Antigravity offers none).

Still OPEN (needs a GUI session through OAuth against real state — no headless path to close):
guard deny wire fired against a real tool call; `.agents/` load path + copy-vs-reference +
`enable-customization-skills`; env-var expansion of `${CRAFT_ROOT}` in the hook command;
per-sandbox-mode blocking; a captured `transcript.jsonl` token-record shape.

## Guard fail-open modes (surfaced by the craft review of this branch)

A craft `review` phase over this branch (4-dimension, real reviewer agents) confirmed the
adapter+hook layer fails **closed** on every malformed payload as designed, and flagged three
fail-open modes to disclose honestly:

- **Inherited shared-predicate bypasses — HIGH, FIXED this session.** The guard delegates
  enforcement to `engine/src/guards/git-ext-diff-predicate.js`, shared by every binding. It had
  failed OPEN on `git diff` with leading whitespace, a `git diff` on a command's second line, and
  any command where `--no-ext-diff` appeared anywhere (a comment, an unrelated `echo`, or a
  compliant first sub-command exempting a non-compliant second). The predicate was hardened to
  judge each **quote-aware** shell-separated segment independently (leading-whitespace/newline
  anchored, quoted option values, per-invocation marker binding, token-boundary comment strip). A
  fix-delta review pass then caught and closed a quoting regression and an over-block the first
  rewrite had introduced. Regression tests pin every closed bypass; all five bindings' guard tests
  stay green. One documented residual: a git diff/show nested in command substitution
  (`$(…)`/backticks) is still not caught — it fails toward output-mangling, not RCE.
- **Process-launch failure = silent allow — MEDIUM.** The benign path is "emit nothing", so a
  hook that never starts (e.g. `${CRAFT_ROOT}` not expanded, or a node crash) is indistinguishable
  from an allow. The JS-level fail-closed only protects once the JS runs. Mitigation: install with
  an **absolute path** to `craft-guard.js` rather than `${CRAFT_ROOT}`. The residual rests on
  Antigravity's **unmeasured** hook-failure semantics (does a non-zero/empty-output hook block or
  allow?) — OPEN.
- **Single-tool matcher — MEDIUM.** The hook fires only on `run_command`, assumed (static read,
  not live enumeration) to be the sole shell-executing tool; another shell tool would bypass the
  guard. Now documented as a load-bearing assumption in the adapter source; OPEN until live tool
  enumeration.

## Reproduction notes

- Confirm no CLI: `command -v antigravity ag gemini`; inspect `/Applications/Antigravity.app`.
- Read the shell source: extract `Contents/Resources/app.asar` (`npx @electron/asar extract …`) and
  read `dist/main.js` (`HEADLESS`, the stdin-forward) + `dist/languageServer.js` (the LS spawn args).
- Pin the LS surfaces: `strings Contents/Resources/bin/language_server | grep -E 'PreToolUse|hooks|
  subagent|SKILL.md|mcp_config|trajectory|permission|sandbox|GEMINI.md|\.agents/rules'`.
- Live identity (isolated): `env -i HOME=<throwaway> language_server --stamp` under a background
  `kill -9` watchdog; verify `find ~/.gemini -newer <marker>` is empty.
- Refresh this record's Verdict, version rows, and OPEN items whenever a new Antigravity build lands.
