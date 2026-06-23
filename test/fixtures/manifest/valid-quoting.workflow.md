---
paths: { repo: "https://host:8080/org/repo", notes: "value with: colon" }
gates:
  phase: "make test && make lint"
  part: "npm run build:check"
phases:
  design:
    context: manifest/stubs/a.md # trailing comment must be stripped
---

# Quoting regression

The phase context carries a trailing `# comment` that the comment-strip must
remove for the stub to resolve — drop the strip and the path becomes dangling.
The quoted gate values guard colon-in-value key extraction.
