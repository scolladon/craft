# Security review lens (sample per-phase `context:` pack)

> Sample content for the [`everything-claude-toolkit`](../../everything-claude-toolkit/) example —
> a toolkit's security rules scoped to the **review** phase only (`phases.review.context`). In a
> real repo this lives at `.claude/workflow/sec-rules.md` and is injected into the review harness,
> not the whole pipeline.

When reviewing a change, additionally check:

- **No hardcoded secrets** — keys, tokens, passwords, connection strings. Required secrets are read
  from the environment or a secret manager and validated at startup.
- **Input validation at every boundary** — external API responses, user input, and file content are
  untrusted until validated against a schema.
- **Injection-safe** — parameterized queries, escaped shell/HTML, no string-built commands from
  untrusted data.
- **Least privilege** — the change doesn't broaden a token's scope, a CORS policy, or a file
  permission beyond what it needs.
- **No sensitive data in errors or logs** — error messages don't leak secrets, tokens, or PII.
