# Slack escalation protocol (sample per-phase `context:` pack)

> Sample content for the [`decisions-remote/`](../../decisions-remote/) example — routes the
> decisions-phase fork conversation to Slack instead of the terminal
> (`phases.decisions.context`). In a real repo this lives at
> `.claude/workflow/slack-escalation.md`; because the decisions phase is session-owned, the
> session reads this file inline at phase start rather than appending it to a spawned agent.

When the decisions phase reaches a candidate already triaged as a genuine fork (triage itself
stays the engine default), conduct that one conversation over Slack instead of in-terminal:

1. **Applies to step 2 only.** Only the fork conversation itself moves to Slack. Adoption, the
   no-op record, the cross-candidate check, ADR authoring, and scope-fold all continue exactly
   as the engine default — nothing here alters them.
2. **Preconditions / secrets.** Read `$SLACK_WEBHOOK_URL`, `$SLACK_BOT_TOKEN`, and
   `$SLACK_CHANNEL_ID` from the environment. Never hardcode a secret. If any is unset, announce
   the fallback loudly in the run record and conduct the fork the normal in-session way
   (a direct question to the user) instead — the recipe degrades, it never proceeds
   half-configured.
3. **Post the fork.** `curl` a message to `$SLACK_WEBHOOK_URL` carrying the question, the ≤3
   labeled options (A/B/C plus label), and the design's recommendation — the same content an
   in-terminal fork would show, e.g.:

   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data "{\"text\": \"Decision fork: <question>\nA) <option A>\nB) <option B>\nC) <option C>\nRecommendation: <letter>\"}" \
     "$SLACK_WEBHOOK_URL"
   ```

4. **Poll for the answer.** Call the Slack Web API `conversations.history` with
   `$SLACK_BOT_TOKEN` and `$SLACK_CHANNEL_ID` at a stated interval (e.g. every 30 seconds)
   until a human reply appears, up to a bounded wait (e.g. 10 minutes). On timeout, fall back
   loudly to the normal in-session conversation in that same breath — state the bounded wait
   and the fallback together. Never keep polling past the bound, never silently stop. Under a
   headless binding with no in-session user to fall back to, that fallback degrades to a
   recorded blocker — do not build a separate blocker path for it.
5. **Map the reply to one option.** Interpret the natural-language reply against the posted
   option letters and labels. A reply that cannot be confidently mapped to one option is
   re-asked in the channel — never resolved by exact-token matching only, never resolved by a
   best-effort guess.
6. **Capture.** Record the chosen option as the user's decision and hand back to the engine's
   default ADR authoring. The run record logs the reply text alongside the option it resolved
   to, exactly as an in-terminal fork would.

## Honest limits

- The wait in step 4 is **synchronous** — the session sits in the poll loop, so this suits a
  minutes-scale answer, not an overnight escalation.
- Step 3 only needs an incoming webhook; step 4 needs a **bot token with channel-history
  scope** — incoming webhooks are write-only and cannot read a channel back.
- The `curl` snippets above are copy-paste-then-verify against your own workspace: Slack's
  wire shapes are documented from Slack's public API, not live-pinned from a real workspace in
  this environment.
- Enforcement here is **prompt-level instruction-following, not mechanical** — the run record
  is the audit trail, not a code path that rejects a bad reply.
- **Microsoft Teams** incoming webhooks are also write-only, so an equivalent Teams recipe
  needs a Graph-API bot instead — named here as out of scope, not built.
