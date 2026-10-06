---
type: regex
target: last_message
arm: both
---
\b(CRITICAL|HIGH|MEDIUM|LOW)\b[\s\S]{0,300}?\b[\w./-]+:\d+|\b[\w./-]+:\d+[\s\S]{0,300}?\b(CRITICAL|HIGH|MEDIUM|LOW)\b|"severity"\s*:\s*"(CRITICAL|HIGH|MEDIUM|LOW)"
