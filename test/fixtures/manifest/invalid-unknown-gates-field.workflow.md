---
gates: { bogus-key: x }
---

# Unknown gates field (inline map)

The yq-backed parser and the subset-parser fallback both validate gate sub-keys
regardless of inline-map vs multi-line form, so an unknown gate field is refused.
