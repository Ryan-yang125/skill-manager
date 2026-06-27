#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="SkillManager"
PRODUCT_NAME="SkillManagerApp"
BUNDLE_ID="com.local.SkillManager"
MIN_SYSTEM_VERSION="14.0"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/build/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"
SOURCE_INFO_PLIST="$ROOT_DIR/Sources/SkillManagerApp/Info.plist"

build_bundle() {
  cd "$ROOT_DIR"
  swift build -c release

  local build_binary="$ROOT_DIR/.build/release/$PRODUCT_NAME"
  rm -rf "$APP_BUNDLE"
  mkdir -p "$APP_MACOS"
  mkdir -p "$APP_CONTENTS/Resources"
  cp "$build_binary" "$APP_BINARY"
  cp "$SOURCE_INFO_PLIST" "$INFO_PLIST"
  chmod +x "$APP_BINARY"
  /usr/bin/codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null
}

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

case "$MODE" in
  run)
    build_bundle
    open_app
    ;;
  --build-only|build)
    build_bundle
    echo "$APP_BUNDLE"
    ;;
  --debug|debug)
    build_bundle
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    build_bundle
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    build_bundle
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    build_bundle
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--build-only|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
