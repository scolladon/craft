#!/usr/bin/env bash
# Installs the dev-tool set CI and the devcontainer share, beyond Node.
set -euo pipefail
readonly APT_PACKAGES=(shellcheck jq zsh)
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
main() {
  as_root apt-get update
  as_root apt-get install -y "${APT_PACKAGES[@]}"
}
main "$@"
