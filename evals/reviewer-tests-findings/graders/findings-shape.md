---
type: regex
target: last_message
flags: i
arm: both
---
\b(CRITICAL|HIGH|MEDIUM|LOW)\b[\s\S]{0,300}?\b(greet(\.test)?\.sh|package\.json)\b|\b(greet(\.test)?\.sh|package\.json)\b[\s\S]{0,300}?\b(CRITICAL|HIGH|MEDIUM|LOW)\b|"severity"\s*:\s*"(CRITICAL|HIGH|MEDIUM|LOW)"
