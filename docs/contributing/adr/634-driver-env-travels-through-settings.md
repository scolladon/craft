---
subjects:
  - docs/contributing/specs/driver.md
---
# 634 — The driver passes `CRAFT_DRIVER_STATE` through `--settings` env, never a launcher export

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/driver-rebuild-bg-lock-gaps.md · **Supersedes/Refines:** Refines ADR-620 (how the env reaches a `--bg` session)

## Context

ADR-620 delivers the state dir through the environment. A live probe (E2, CLI 2.1.302) showed that a
`claude --bg` session's env is the background service's env, fixed when the service starts. While the
service runs, a launcher's export is ignored, whether set, unset or changed, and one export leaks into
every later background session, driven or not. `--settings` with `{"env":{"CRAFT_DRIVER_STATE":…}}`
reached hooks and the Bash tool, won over the service env, and was restored on a bare `--resume`.

## Options considered

1. **`--settings` env** *(recommended)*. Pros: per session, and restored on resume. Cons: the settings
   file must stay in place until the entry ends.
2. **A craft flag on the prompt.** Cons: reopens ADR-620; the flag rides elections.

## Decision

Adopted-as-recommended (no user judgment). A driver passes the variable as `claude --bg --settings
<file>` with `{"env":{"CRAFT_DRIVER_STATE":"<abs-dir>"}}`. It never exports the variable in a shell
that may start the background service. The channel is still the environment, so ADR-620's "env only,
no craft flag" holds.

## Consequences

- `docs/contributing/specs/driver.md` §Activation drops "set it again on `--resume`".
- Craft cannot detect a leaked service env, so the spec warning is the only guard.
