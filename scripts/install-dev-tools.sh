#!/usr/bin/env bash
# Installs the tools scripts/ci.sh needs beyond Node: the same set in CI and the devcontainer.
set -euo pipefail
readonly APT_PACKAGES=(bats shellcheck jq)
readonly YQ_VERSION=v4.44.3
readonly YQ_BIN_DIR="${YQ_BIN_DIR:-/usr/local/bin}"
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
yq_asset() {
  local arch; arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64|arm64) printf 'yq_linux_%s' "$arch" ;;
    *) echo "install-dev-tools: no yq asset for architecture: $arch" >&2; return 1 ;;
  esac
}
main() {
  local asset; asset="$(yq_asset)"
  as_root apt-get update
  as_root apt-get install -y "${APT_PACKAGES[@]}"
  as_root curl -fsSL -o "$YQ_BIN_DIR/yq" \
    "https://github.com/mikefarah/yq/releases/download/$YQ_VERSION/$asset"
  as_root chmod +x "$YQ_BIN_DIR/yq"
}
main "$@"
