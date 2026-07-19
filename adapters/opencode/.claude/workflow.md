---
# craft-opencode committed manifest — resolves code-producing phase's gate.
# models carry bare tier strings only (never provider/model): the manifest
# stays portable across bindings.
gates:
  phase: "node --test"
models:
  fallback: sonnet
---
# craft-opencode manifest (policy rationale in prose body — never reaches YAML parser)
