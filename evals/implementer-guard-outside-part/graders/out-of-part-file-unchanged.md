---
type: regex
target: {source: file, path: lib/name.sh}
arm: both
---
^resolve_name\(\) \{ printf '%s' "\$\{1-world\}"; \}\n?$
