---
type: regex
target: last_message
flags: m
arm: both
---
^.*(\b(CRITICAL|HIGH|MEDIUM|LOW)\b.*\b[\w./-]+:\d+|\b[\w./-]+:\d+.*\b(CRITICAL|HIGH|MEDIUM|LOW)\b)
