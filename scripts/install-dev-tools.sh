#!/usr/bin/env bash
# Installs the dev-tool set CI and the devcontainer share, beyond Node.
set -euo pipefail
readonly APT_PACKAGES=(bats shellcheck jq)
readonly YQ_VERSION=v4.44.3
readonly YQ_SHA256_AMD64=a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7
readonly YQ_SHA256_ARM64=0e7e1524f68d91b3ff9b089872d185940ab0fa020a5a9052046ef10547023156
readonly YQ_BIN_DIR="${YQ_BIN_DIR:-/usr/local/bin}"
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
yq_sha256() {
  case "$1" in
    amd64) printf '%s' "$YQ_SHA256_AMD64" ;;
    arm64) printf '%s' "$YQ_SHA256_ARM64" ;;
    *) echo "install-dev-tools: no yq asset for architecture: $1" >&2; return 1 ;;
  esac
}
install_yq() {
  local arch="$1" sha256="$2" download status=0
  download="$(mktemp "${TMPDIR:-/tmp}/yq.XXXXXX")"
  {
    curl -fsSL -o "$download" \
      "https://github.com/mikefarah/yq/releases/download/$YQ_VERSION/yq_linux_$arch" \
      && echo "$sha256  $download" | sha256sum -c --quiet - \
      && as_root install -m 0755 "$download" "$YQ_BIN_DIR/yq"
  } || status=$?
  rm -f "$download"
  return "$status"
}
main() {
  local arch sha256
  arch="$(dpkg --print-architecture)"
  sha256="$(yq_sha256 "$arch")"
  as_root apt-get update
  as_root apt-get install -y "${APT_PACKAGES[@]}"
  install_yq "$arch" "$sha256"
}
main "$@"
