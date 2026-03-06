#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/safari"
APP_NAME="Timbers Matchday"
BUNDLE_ID="com.timbersmatchday.safari-extension"

if ! command -v xcrun &>/dev/null; then
  echo "Error: xcrun not found. Install Xcode from the App Store." >&2
  exit 1
fi

if ! xcrun safari-web-extension-converter --help &>/dev/null; then
  echo "Error: safari-web-extension-converter not found." >&2
  echo "This requires full Xcode (not just Command Line Tools)." >&2
  echo "Install Xcode from the App Store, then run:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

if [ -d "$OUTPUT_DIR" ]; then
  echo "Removing existing safari/ output directory..."
  rm -rf "$OUTPUT_DIR"
fi

echo "Converting Chrome extension to Safari Web Extension..."
echo "  Source:  ${PROJECT_ROOT}"
echo "  Output:  ${OUTPUT_DIR}"

xcrun safari-web-extension-converter "$PROJECT_ROOT" \
  --project-location "$OUTPUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt

echo ""
echo "Safari extension project created at: ${OUTPUT_DIR}/"
echo ""
echo "Next steps:"
echo "  1. Open the Xcode project:  open ${OUTPUT_DIR}/${APP_NAME}/${APP_NAME}.xcodeproj"
echo "  2. Select a signing team in Xcode (Signing & Capabilities)"
echo "  3. Build and run (Cmd+R)"
echo "  4. In Safari: Settings > Extensions > enable '${APP_NAME}'"
echo ""
echo "For development without signing:"
echo "  Safari > Settings > Advanced > Show Develop menu"
echo "  Develop > Allow Unsigned Extensions"
