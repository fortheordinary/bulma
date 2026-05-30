#!/usr/bin/env bash
# bulma — agentic global account for remote workers
# Installer:  curl -fsSL https://bul.ma/install.sh | bash
#
# Env overrides:
#   BULMA_DL_BASE     URL prefix for binaries (default: https://dl.bul.ma)
#   BULMA_PREFIX      Install directory       (default: /usr/local/bin)
#   BULMA_VERSION     Specific version to pin (default: latest)

set -euo pipefail

BASE="${BULMA_DL_BASE:-https://dl.bul.ma}"
PREFIX="${BULMA_PREFIX:-/usr/local/bin}"
VERSION_REQ="${BULMA_VERSION:-latest}"

err() { echo "bulma: $*" >&2; exit 1; }

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) err "unsupported arch: $arch" ;;
esac
case "$os" in
  linux|darwin) ;;
  *) err "unsupported os: $os (only linux/darwin)" ;;
esac

target="bulma-${os}-${arch}"
src="${BASE}/${VERSION_REQ}/${target}"
sums_src="${BASE}/${VERSION_REQ}/SHA256SUMS"

# Pick a sha256 tool we can find.
if command -v sha256sum >/dev/null 2>&1; then
  sha_cmd="sha256sum -c -"
elif command -v shasum >/dev/null 2>&1; then
  sha_cmd="shasum -a 256 -c -"
else
  err "no sha256 utility found (need sha256sum or shasum)"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "==> Downloading $target ($VERSION_REQ)"
curl -fsSL "$src"      -o "$tmp/$target"      || err "download failed: $src"
curl -fsSL "$sums_src" -o "$tmp/SHA256SUMS" || err "checksum download failed: $sums_src"

echo "==> Verifying checksum"
(cd "$tmp" && grep " $target\$" SHA256SUMS | $sha_cmd) \
  || err "checksum mismatch — refusing to install"

chmod +x "$tmp/$target"

echo "==> Installing to $PREFIX/bulma"
if [ -w "$PREFIX" ]; then
  mv "$tmp/$target" "$PREFIX/bulma"
elif command -v sudo >/dev/null 2>&1; then
  sudo mv "$tmp/$target" "$PREFIX/bulma"
else
  alt="$HOME/.local/bin"
  mkdir -p "$alt"
  mv "$tmp/$target" "$alt/bulma"
  PREFIX="$alt"
  echo "==> No write access to /usr/local/bin and no sudo; installed to $alt"
  case ":$PATH:" in
    *":$alt:"*) ;;
    *) echo "==> Add this to your shell rc: export PATH=\"$alt:\$PATH\"" ;;
  esac
fi

# macOS quarantine: cross-compiled darwin binaries are unsigned; strip the
# attribute so Gatekeeper doesn't block the first run.
if [ "$os" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$PREFIX/bulma" 2>/dev/null || true
fi

echo
"$PREFIX/bulma" version
echo
echo "Run 'bulma help' for available commands."
