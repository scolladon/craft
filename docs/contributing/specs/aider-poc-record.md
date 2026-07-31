# Aider PoC — feasibility + contract-discovery record

> This document records the **Phase 0 feasibility gate** for a native Aider binding of the
> craft harness — the analog built for codex/copilot/opencode/pi/cursor and declined for
> antigravity. Facts are pinned against the **real `aider` CLI on this machine** (aider
> 0.86.2, homebrew, Python 3.12.13), read from the complete argparse surface and confirmed
> with **isolated, authenticated live runs** — including a real end-to-end build that
> auto-committed. Every row is CONFIRMED (observed live), SOURCE (read from the shipped
> `--help`/argparse surface, not executed), or OPEN (not exercised; stated as unknown,
> never assumed).

> **Two verdicts, scored independently — Aider is architecturally unlike the siblings.**
> codex/copilot/cursor are general agents that call shell/edit TOOLS through a hook, which is
> exactly what craft's guard binds to. Aider is a focused **edit loop**: it adds files to a
> chat, proposes+applies edits, and **auto-commits to git**; its only shell surface is
> `/run` / `--test-cmd` / `--lint-cmd`, and it has **no pre-execution veto point**.
>
> **(1) RUNNABLE EXECUTION binding — GO.** Aider ships a headless one-turn-and-exit port
> (`--message` + `--yes-always`), a per-invocation `--model`, first-class git auto-commit,
> and a persisted token-bearing transcript. The adapter is built at `adapters/aider/`
> (execution + model + first-class VCS + telemetry), and dogfooded by a live Game-of-Life
> build.
>
> **(2) ENFORCING GUARD binding — NO-GO (hard blocker, declined honestly).** Aider has **no**
> deny-capable pre-execution hook — no `--hook`, no `hooks.json`, no PreToolUse/
> beforeShellExecution, no plugin/extension seam anywhere in its complete argparse surface.
> `--test-cmd`/`--lint-cmd`/`--auto-test`/`--auto-lint` **run** commands (they cannot deny);
> `--yes-always` **auto-approves** (it removes the only interactive gate). Aider drives git
> **internally** (GitPython) and never shells `git diff`, so the shared **git-ext-diff
> predicate is MOOT** — there is nothing to intercept — and aider commits with `--no-verify`
> by default (`--git-commit-verify` defaults False), bypassing even git's own pre-commit
> hook. The shell surface runs **unsandboxed** (measured: a side-effect file was created
> outside the repo root). No guard is built; the copilot `--deny-tool` / antigravity no-hook
> precedent applies.

## Verdict: **GO for execution / NO-GO for guard** (2026-07-23)

`aider` is Paul Gauthier's open-source, model-agnostic, git-native AI pair-programmer (a Python
package; `aider-chat` on PyPI, installed here via Homebrew). It runs a single non-interactive
turn with `-m/--message` (`--yes-always` for non-interactivity), takes a per-invocation
`--model` (BYO provider), requires a git repo and **auto-commits** each applied edit, and
persists a markdown transcript (`.aider.chat.history.md`) plus an optional LLM log
(`--llm-history-file`). Every surface a craft **execution/model/VCS/telemetry** binding needs is
present and was exercised under isolation. The one surface a craft **guard** binding needs — a
deny-capable pre-execution hook — is absent, and is declined as a structural property of the
tool.

**Recommendation:** build the runnable execution/model/**VCS**/telemetry binding (done —
`adapters/aider/`); decline the guard. A craft guard has **nothing to bind to** on Aider and
**nothing to enforce** (the git-ext-diff predicate it carries is moot when git is driven
internally). Re-open the guard axis only if Aider ships a pre-tool hook — see the BACKLOG
condition-gated trigger.

## Probe method

The decisive evidence for the guard axis is **the complete argparse surface itself** — Aider is
a monolithic open-source Python app whose entire flag/subcommand contract is emitted by
`aider --help` (521 lines, captured); there is no hidden hook system, plugin loader, or
extension host to discover behind it (unlike a webpack-bundled agent). Every runnable claim was
then confirmed **live** under the mandated isolation protocol:

- **Throwaway HOME** (`$SCRATCH/aider-probe/home`) so every write (`~/.aider/analytics.json`,
  caches) landed in scratch, never the operator's real `~/.aider`.
- **Auth seed = the ambient `ANTHROPIC_API_KEY` env var, passed through.** Aider auth is
  **file/env, not a keychain** (litellm reads `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/… from the
  process env, or `--api-key provider=key`, `.env`, `.aider.conf.yml`). There is **nothing to
  symlink** (the Cursor keychain lesson does not transfer). The key's *value* was never read.
- **`git init` throwaway working dirs** — Aider needs a git repo; each probe ran in its own.
- **Background-kill watchdog** `( cmd & PID=$!; ( sleep N; kill -9 $PID ) & wait $PID )` (macOS
  has no `timeout`).
- **Isolation verified, not assumed:** `find ~/.aider* -newer <marker>` returned **empty** after
  every live turn (marker set after the bare `--help`/`--version`/`--list-models`, which touch
  state). The real `~/.aider.chat.history.md` mtime was unchanged; the real `~/.aider/` dir
  predates the probes (Mar 28, operator's prior state). One stray `.aider.chat.history.md` a
  *pre-isolation* bare `--list-models` wrote into the real repo root was removed; both real repos
  are clean. Trust is an independent re-run, never the tool's self-report.

## Product identity

| Question | Answer | Status |
|---|---|---|
| Which product? | **Aider** — open-source, model-agnostic, git-native AI pair-programmer. `aider is AI pair programming in your terminal`. | CONFIRMED |
| Version | `aider --version` → **`0.86.2`**. | CONFIRMED (live) |
| Install path / entrypoint | `/opt/homebrew/bin/aider` → Homebrew Cellar shim over `/opt/homebrew/Cellar/aider/0.86.2/libexec/bin/python`. **Python 3.12.13** (not 3.14 — the brief's figure corrected against the live self-report). PyPI package `aider-chat`. | CONFIRMED (live) |
| Competing/legacy binary shadowing `aider`? | **No.** `which -a aider` → a single `/opt/homebrew/bin/aider`. | CONFIRMED |
| Auth | **Env/file, not keychain.** `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/… (litellm), `--anthropic-api-key`, `--api-key provider=key`, `.env` (git-root default), `.aider.conf.yml`. | CONFIRMED |

## Headless execution port (verdict 1 — CONFIRMED live)

| Surface | Finding | Status |
|---|---|---|
| One-turn-and-exit | `-m/--message "<msg>"` (`--msg`) — "Specify a single message to send the LLM, process reply then exit (disables chat mode)". Also `--message-file/-f <path>`. | CONFIRMED (live) |
| Non-interactivity | `--yes-always` — "Always say yes to every confirmation". **Required**: without it, a headless run in a git repo blocks on the interactive "Add .aider* to .gitignore?" prompt and **crashes on non-terminal stdin** (`KeyError: '0 is not registered'`). The binding also passes `--no-gitignore --no-check-update --no-show-release-notes` to suppress other interactive/startup prompts. | CONFIRMED (live) |
| **Machine-readable result** | **NOT a JSON envelope.** The result signals, in order of reliability: (1) the **git commit(s) created** by auto-commit (the authoritative success signal); (2) the persisted `.aider.chat.history.md`; (3) `--llm-history-file`. | CONFIRMED (live) |
| **Exit code is NOT a success signal** | **Aider exits `0` even on a hard LLM API error.** A run whose completion failed with `litellm.BadRequestError … credit balance is too low` still returned **exit 0** and created **no commit**. A binding that trusted the exit code would read failure as success — the result signal MUST be "did a new commit land / did the target file change", never `$?`. | CONFIRMED (live) |
| Per-invocation model | `--model <id>` (env `AIDER_MODEL`). Plus `--weak-model` (commit msgs + history summarization), `--editor-model`, `--architect`, `--reasoning-effort`, `--thinking-tokens`. | CONFIRMED |
| Working dir | cwd IS the working dir; the git repo containing cwd is the root. Ran headless in a `git init`-ed dir; found the git-root `.aider.conf.yml` even when cwd was a **subdirectory**. | CONFIRMED (live) |
| Real one-turn build | `aider --message "Create hello.py …" --model ollama_chat/qwen2.5-coder:7b --yes-always` produced a correct `hello.py`, printed `Tokens: 781 sent, 19 received.`, and **auto-committed** `feat(hello.py): add greet function`. | CONFIRMED (live) |

## Git / VCS handling (verdict 1 — the first-class VCS-port angle)

| Surface | Finding | Status |
|---|---|---|
| Git-repo requirement | `--git/--no-git` (default **True** — Aider looks for and needs a git repo). `--skip-sanity-check-repo` bypasses the startup repo sanity check. | CONFIRMED |
| Auto-commit | `--auto-commits/--no-auto-commits` (default **True**). Each applied edit is committed with a generated conventional-style message (`feat(hello.py): add greet function` observed). **This is the handoff mechanism** — the commit, not stdout, is the artifact. | CONFIRMED (live) |
| Dirty-tree handling | `--dirty-commits/--no-dirty-commits` (default **True**) — commits a dirty tree before editing. `--commit` (commit pending + exit), `--commit-prompt`, `--dry-run`. | CONFIRMED |
| Attribution | `--attribute-co-authored-by` (default **True**) adds a `Co-authored-by: aider (<model>) <aider@aider.chat>` trailer (observed). `--attribute-author`/`--attribute-committer` (default True), `--attribute-commit-message-author`/`-committer` (default False). The binding's VCS posture **disables** attribution to keep commits one-line-conventional (craft commit style). | CONFIRMED (live) |
| **Pre-commit hooks** | `--git-commit-verify` default **False** → Aider commits with **`--no-verify`**, bypassing git's own pre-commit hook. This is a second reason a craft guard has no seam here: neither a craft hook nor a git hook fires on Aider's commit path. | CONFIRMED |
| Scope | `--subtree-only`, `--aiderignore <file>` (default `.aiderignore` in git root), `--gitignore` (adds `.aider*` to `.gitignore`). | CONFIRMED |

## Model tier map + auth (verdict 1 — BYO provider)

Pinned against the LIVE `aider --list-models` litellm catalogue (2026-07-23). Chosen the direct
`anthropic/` provider forms (route to the Anthropic API via `ANTHROPIC_API_KEY`) that are
catalogue-present, so litellm has metadata/pricing/token-counting and `--show-model-warnings` is
satisfied. Aider bakes no effort into the id (unlike Cursor) — reasoning effort is the separate
`--reasoning-effort` flag.

| craft tier | Aider `--model` id | Status |
|---|---|---|
| opus | `anthropic/claude-opus-4-6` | CONFIRMED in catalogue |
| sonnet | `anthropic/claude-sonnet-4-6` | CONFIRMED in catalogue |
| haiku | `anthropic/claude-haiku-4-5` | CONFIRMED in catalogue |

| Auth question | Answer | Status |
|---|---|---|
| Where does the key live? | Process **env var** (`ANTHROPIC_API_KEY`), `--anthropic-api-key`, `--api-key anthropic=<key>`, `.env`, or `.aider.conf.yml`. **No keychain.** | CONFIRMED |
| Env-var auth resolves in an isolated run? | Yes — passing `ANTHROPIC_API_KEY` through the throwaway-HOME env authenticated litellm (the request reached the Anthropic API and was rejected only on **billing**, not auth). | CONFIRMED (live) |
| **This box's key limitation** | The ambient `ANTHROPIC_API_KEY` is a **subscription** token with **no API credits** — direct Anthropic completions fail `invalid_request_error … Your credit balance is too low`. Per the model-down/credit-degrade lesson this is model-down, NOT a task blocker: the tier map is unchanged (Anthropic BYO); the live proofs degrade to a **local `ollama_chat/qwen2.5-coder:7b`** (a genuine working model driven through the binding). No other provider key exists on this box. | CONFIRMED (live) |

## Guard / hook mechanism (verdict 2 — the decisive surface — NO-GO)

| Question | Answer | Status |
|---|---|---|
| PreToolUse-equivalent that can DENY a shell/edit before it runs? | **No.** The complete argparse surface has no `--hook`, no `hooks.json`, no `beforeShellExecution`/PreToolUse, no plugin/extension/loader seam. | CONFIRMED (full surface) |
| Do `--test-cmd`/`--lint-cmd`/`--auto-test`/`--auto-lint` gate anything? | **No — they RUN, they do not deny.** They execute a configured command after edits; there is no veto callback. | CONFIRMED |
| Does `--yes-always` gate anything? | **The opposite** — it AUTO-APPROVES every confirmation (the gitignore prompt, "create file?", suggested-shell-command prompts), removing the only interactive gate. | CONFIRMED (live) |
| Is the git-ext-diff predicate even relevant? | **No — MOOT.** Aider drives git **internally via GitPython**; it never shells `git diff`/`git show` to parse, so there is no external-diff-mangling command for the predicate to catch. The predicate the sibling guards carry has **nothing to enforce** on Aider. | CONFIRMED (surface + design) |
| Any seam at all to enforce a craft guard on? | **None.** No pre-tool hook (craft's binding point), git commits bypass git hooks (`--no-verify` default), and there is no sandbox. | CONFIRMED |
| Go/No-Go for verdict (2) | **NO-GO.** Build no guard. This is the honest declination (copilot `--deny-tool`/antigravity no-hook precedent), not a forced guard onto a tool that cannot support one. | DECIDED |

## Sandbox / permission model (verdict 2 — measured)

| Surface | Finding | Status |
|---|---|---|
| Is there a sandbox? | **No.** No `--sandbox` flag; no containment mode. | CONFIRMED |
| Ground-truth side-effect test | `--test --test-cmd "touch <path OUTSIDE the repo>"` **created the file outside the repo root** → Aider's shell surface runs **UNSANDBOXED** with no filesystem containment. | CONFIRMED (live, measured) |
| Implication | With no sandbox AND no pre-execution veto, there is no enforcement layer a craft guard could occupy. The safety posture Aider offers is human review of proposed edits/commands in the interactive TUI — which `--yes-always` removes for headless use. Documented honestly; not claimed as containment. | CONFIRMED |

## Customization surface (agents / conventions / config)

| Surface | Finding | Status |
|---|---|---|
| Native subagents / personas? | **None.** Aider has no agent-def schema, no subagent system. craft's 9 role agents map to **separate `aider --message` invocations per phase** (the per-process model), with the role **body injected via `--read <conventions-file>`** (read-only context) or prepended to the message. | CONFIRMED (full surface) |
| Read-only context injection | `--read FILE` (repeatable) adds a read-only file to the chat; `CONVENTIONS.md` is the documented convention. Proven: a `.aider.conf.yml` `read: [CONVENTIONS.md]` loaded the file. | CONFIRMED (live) |
| Config file | `.aider.conf.yml` — searched **git-root → cwd → home** (found from a subdirectory). Precedence: **CLI > env (`AIDER_*`) > config > defaults**. `-c/--config <file>` overrides the search. | CONFIRMED (live) |
| Env file | `.env` (git-root default) via `--env-file`; `--set-env VAR=val`. | CONFIRMED |
| Model settings | `--model-settings-file` (`.aider.model.settings.yml`), `--model-metadata-file`, `--alias ALIAS:MODEL`. | CONFIRMED |
| Skills / commands system? | **None** to bind. Aider's `/commands` are interactive TUI commands (`/run`, `/add`, `/test`); `--load FILE` replays them on launch. There is no installable skill/command contract like cursor's `.cursor/commands` — the craft "entrypoint" for Aider is the **execution-port launch-args driver**, not an in-tool skill. | CONFIRMED |

## Telemetry / persisted record (verdict 1 — pinned against a REAL session)

| Surface | Finding | Status |
|---|---|---|
| Persisted transcript | **`.aider.chat.history.md`** in the git root — a **markdown** transcript (not JSON), appended per session. Header block: `# aider chat started at <ts>`, `> <full command>`, `> Aider v0.86.2`, `> Model: <id> with <edit-format>`, `> Git repo: …`; then `#### <user message>`, the assistant reply (fenced code), and outcome lines `> Applied edit to <f>` / `> Commit <sha> <msg>`. | CONFIRMED (live) |
| **Token-bearing record** | The persisted line **`> Tokens: <sent> sent, <received> received.`** (`781 sent, 19 received` captured). For a **paid** provider a **`Cost: $X message, $Y session.`** clause is appended to the same line (SOURCE — ollama is free so no cost clause was emitted). **`sent` = input tokens, `received` = output tokens**; with `--cache-prompts` (Anthropic) aider appends cache-write/cache-hit detail. Convention pinned from the real numbers: sent→input, received→output, cache fields absent ⇒ cacheRead/cacheCreation 0. | CONFIRMED (live) |
| LLM log | `--llm-history-file <path>` → `TO LLM <ts>` / `SYSTEM …` / `USER …` / `ASSISTANT …` blocks (includes aider's **few-shot examples** embedded in the prompt — a parser must not mistake them for real turns). | CONFIRMED (live) |
| Analytics | `--analytics/--no-analytics` (PostHog, opt-in, default random); `~/.aider/analytics.json` (uuid). The binding passes `--no-analytics`. | CONFIRMED |
| Persisted ≠ live | Aider has **no live JSON stream**; the persisted markdown IS the record. The telemetry binding parses `.aider.chat.history.md` for the `Tokens:` line (fixture: `engine/test/fixtures/aider/`). | CONFIRMED |

## Phase B — live-evidence rows

| B-item | Evidence | Status |
|---|---|---|
| Execution: real `aider --message` one-turn build headless | `hello.py` built + auto-committed `feat(hello.py): add greet function`; exit 0; `Tokens: 781 sent, 19 received.` | CLOSED (live) |
| Exit-code trap pinned | A credit-failed run returned exit 0 with no commit → success signal is the commit, not `$?`. | CLOSED (live) |
| Guard (built?) | **Not built — verdict (2) NO-GO.** No deny surface exists; declination recorded above. | CLOSED (declined) |
| Config/conventions load end-to-end | `.aider.conf.yml` loaded from git-root (and from a subdir); `read: [CONVENTIONS.md]` attached the read-only file. | CLOSED (live) |
| Sandbox/permission ground-truth | `--test-cmd` wrote a file OUTSIDE the repo root → unsandboxed, no containment. | CLOSED (live, measured) |
| Env-var/config auth resolves in isolation | `ANTHROPIC_API_KEY` passed through the throwaway env authenticated litellm (reached the API; rejected only on billing). | CLOSED (live) |
| Real session captured; token shape pinned | `.aider.chat.history.md` captured; token record pinned to `> Tokens: N sent, M received.`; fixture committed under `engine/test/fixtures/aider/`. | CLOSED (live) |
| Isolation (nothing touched real state) | `find ~/.aider* -newer <marker>` empty after every live turn; real history mtime unchanged; `~/.aider/` predates the probes; both real repos clean. | CLOSED (live) |
| **Live construction proof (GoL)** | The delivered binding's OWN `buildLaunchArgs` + `buildVcsPostureArgs` + `resolveAiderModel` emitted the exact 14-element argv that drove a real `aider --message` turn to build Conway's Game of Life (`life.py` + `test_life.py`, auto-committed `3a454bb feat(life.py): add Conway Game of Life step function and tests`). `resolveAiderModel('sonnet')` resolved to `anthropic/claude-sonnet-4-6` (printed); the model VALUE degraded to `ollama_chat/qwen2.5-coder:7b` (no Anthropic credits — model-down protocol), the rest of the argv is the binding's own output. **Commit trailers were EMPTY** — the VCS posture's `--no-attribute-*` flags produced a clean one-line-conventional commit (decision B proven live). **Independently ground-truthed** (my own checks importing the produced `step()`, NOT the model's own tests): blinker period-2, block still-life, lone-cell death, immutability (input unmutated), and edge/no-wraparound all PASS (6/6). Isolation held (`find ~/.aider* -newer <marker>` empty; real history mtime unchanged). A binding isn't done until a real build dogfoods it end to end — this closes that. | CLOSED (live) |
| **Full-pipeline dogfood (craft orchestrator drives aider per-part)** | Beyond the single turn: the craft orchestrator ran a multi-part GoL build with **aider as the construction worker**, each part invoked through the binding's OWN `buildLaunchArgs` (part-implementer role body injected via `--read`) + `buildVcsPostureArgs` + `reconcileGateOutcome`. **Part A** (create `step()` + unittest tests) → gate green → reconcile **accept** (independently ground-truthed 5/5). **Part C** (reset-on-red): aider committed, a red gate → `reconcileGateOutcome('red')` returned `{reset, preHead}` → `git reset --hard` → **the red-gated commit was discarded** — the never-commit-on-red engine floor holds end-to-end through the binding. Isolation held. **Finding**: an incremental EDIT to an existing file (**Part B**, add `advance()`) **no-op'd on the 7B local model** even with `--file` added — a model-capability limit (creates work, edits need a capable model), degradable, NOT a binding defect. **Conclusion**: `--file` is **necessary and not sufficient** — `buildLaunchArgs` now emits it as an `editFiles` option alongside `--read`, but the no-op was observed with `--file` already spliced into that turn's argv, so a capable model is also required. This record does **not** claim the edit-to-existing path is proven; only file creation is CONFIRMED live. | CLOSED (live) + finding |
