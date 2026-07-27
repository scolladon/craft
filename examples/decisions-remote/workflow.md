---
# Route the craft decisions-phase fork conversation to Slack. Injection point #8 (PRD §7):
# per-phase `phases.decisions.context` — an additive, contract-safe Tier-1 file the
# session-owned decisions phase reads inline at phase start. `policy.always: [external-send]`
# lets the outward Slack posts proceed unattended instead of stopping for confirmation.
phases:
  decisions:
    context: .claude/workflow/slack-escalation.md
policy: { always: [external-send] }
---

# Example — decisions escalation over Slack (`phases.decisions.context`)

`context:` under a phase key (#8, PRD §7) is a per-phase variant of the global `context:`
point: instead of appending to every agent invocation, it targets one phase only. The
decisions phase is **session-owned** — the session itself runs it, there is no spawned
per-phase agent — so this file is read inline by the session at phase start rather than
appended to a worker's prompt.

Drop the protocol in `.claude/workflow/slack-escalation.md` (here), point
`phases.decisions.context` at it: whenever the decisions phase reaches a candidate already
triaged as a genuine fork, the session conducts that one conversation over Slack instead of
in-terminal. Everything else the decisions phase does — triage, adoption, the no-op record,
the cross-candidate check, ADR authoring, scope-fold — is unchanged.

Posting to Slack is an outward, hard-to-reverse send, so it falls under the `external-send`
policy action. Without a verdict it defaults to `ask` and would stop the run for confirmation
on every fork; `always` lets it proceed unattended:

| | unconfigured repo | with this manifest |
|---|---|---|
| `external-send` (Slack post) | defaults to `ask` — stops for confirmation | `always` — proceeds unattended |

## The policy blast radius

`policy` has no per-phase scope. Setting `always: [external-send]` here greenlights *every*
external-send action anywhere in the run, not only the decisions-phase Slack posts — there is
no narrower verdict to reach for. Know that before adopting this manifest as-is.

## Honest limits

- The wait for a human reply is **synchronous** — the session sits in a poll loop, so this
  suits minutes-scale answers, not an overnight escalation.
- Posting only needs an incoming webhook; reading the reply back needs a **bot token with
  channel-history scope** — incoming webhooks are write-only.
- The `curl` snippets in the support file are copy-paste-then-verify against your own
  workspace: Slack's wire shapes are documented from Slack's public API, not live-pinned from
  a real workspace in this environment.
- Enforcement here is **prompt-level instruction-following, not mechanical** — the run record
  is the audit trail, not a code path that rejects a bad reply.
- **Microsoft Teams** incoming webhooks are also write-only, so an equivalent Teams recipe
  needs a Graph-API bot instead of a plain webhook — named here as out of scope, not built.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
