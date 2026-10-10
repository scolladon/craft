---
type: regex
target: trace
match: not_contains
arm: both
---
"name":"(?:Edit|Write)","input":\{[^{}]*?"file_path":"(?:[^"]*/)?lib/name\.sh"
