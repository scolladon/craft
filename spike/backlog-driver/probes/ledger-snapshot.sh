#!/usr/bin/env bash
# Copies every open craft run ledger (except the spike's own) into <out-dir> every 20 s,
# because a run deletes its ledger at close and the phase timestamps would be lost.
set -uo pipefail
runs="${1:?craft-runs dir}"; out="${2:?out dir}"; skip="${3:-}"
mkdir -p "$out"
while true; do
  for ledger in "$runs"/*.md; do
    [ -f "$ledger" ] || continue
    [ "$(basename "$ledger" .md)" = "$skip" ] && continue
    cp "$ledger" "$out/$(basename "$ledger")"
  done
  sleep 20
done
