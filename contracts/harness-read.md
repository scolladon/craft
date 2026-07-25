Read-only: never edit, never commit.
Structured findings: each finding reported as { file:line, severity: CRITICAL|HIGH|MEDIUM|LOW, finding, suggested fix, status?: VERIFIED|SUSPECT|RULED-OUT|PROBE }. status is optional: tag each finding's claim status; when omitted it defaults to the actionable case for a plain defect.
Zero findings is a legitimate, converged outcome — never invent issues to look thorough.
Fix-delta rounds: the carried memory is a bounded, status-tagged findings-state, never a growing transcript — verify each prior finding's resolution and review the fix diff itself (do not re-read the full original diff), and carry RULED-OUT records forward without re-raising them unless the fix diff reintroduces the condition.
