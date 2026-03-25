#!/usr/bin/env bash
# convert-safari.sh
# Converts the Chrome extension to a Safari Web Extension Xcode project.
# Requires: full Xcode from the App Store (not just Command Line Tools).
#
# Usage:  npm run build:safari
#   OR:   bash scripts/convert-safari.sh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/safari"
APP_NAME="Timbers Matchday"
BUNDLE_ID="com.timbersmatchday.safari-extension"
PBXPROJ="${OUTPUT_DIR}/${APP_NAME}/${APP_NAME}.xcodeproj/project.pbxproj"

# ── Toolchain checks ─────────────────────────────────────────────────────────

if ! command -v xcrun &>/dev/null; then
  echo "Error: xcrun not found. Install Xcode from the App Store." >&2
  exit 1
fi

if ! xcrun -f safari-web-extension-converter &>/dev/null; then
  echo "Error: safari-web-extension-converter not found." >&2
  echo "  Requires full Xcode — not just Command Line Tools." >&2
  echo "  Install Xcode from the App Store, then:" >&2
  echo "    sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 not found." >&2
  echo "  Required for cleanup-safari-resources.py post-conversion step." >&2
  echo "  Install via Homebrew:  brew install python3" >&2
  echo "  Or download from:      https://www.python.org/downloads/" >&2
  exit 1
fi

# ── Safety check: telemetry.local.js must NOT ship in the Safari bundle ───────
if [ -f "${PROJECT_ROOT}/telemetry.local.js" ]; then
  echo ""
  echo "⚠️  WARNING: telemetry.local.js is present in the project root." >&2
  echo "   The converter will include it in the Xcode project." >&2
  echo "   After conversion, cleanup-safari-resources.py will remove it" >&2
  echo "   from the extension target's build phase." >&2
  echo ""
fi

# ── Remove previous output ────────────────────────────────────────────────────

if [ -d "$OUTPUT_DIR" ]; then
  echo "Removing existing safari/ output directory..."
  rm -rf "$OUTPUT_DIR"
fi

# ── Run the converter ─────────────────────────────────────────────────────────
# Runs against the project root (not a staging directory — required by this
# version of safari-web-extension-converter). The converter will reference all
# files in the project root; cleanup-safari-resources.py removes the unwanted
# ones from the extension target's build phase in the next step.

echo "Converting Chrome extension to Safari Web Extension..."
echo "  Source:  ${PROJECT_ROOT}"
echo "  Output:  ${OUTPUT_DIR}"
echo ""

xcrun safari-web-extension-converter "${PROJECT_ROOT}" \
  --project-location "${OUTPUT_DIR}" \
  --app-name "${APP_NAME}" \
  --bundle-identifier "${BUNDLE_ID}" \
  --swift \
  --macos-only \
  --no-open \
  --no-prompt

# ── Clean up the Xcode project ────────────────────────────────────────────────
# The converter adds ALL files from the project root to the extension target's
# Resources build phase (including node_modules, tests, zip archives, etc.).
# This step removes them so only the actual extension files are bundled.

if [ -f "$PBXPROJ" ]; then
  echo ""
  echo "Cleaning extension Resources build phase..."
  python3 "${PROJECT_ROOT}/scripts/cleanup-safari-resources.py" "${PBXPROJ}"
else
  echo ""
  echo "Error: project.pbxproj not found — conversion likely failed." >&2
  echo "  Expected: ${PBXPROJ}" >&2
  exit 1
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "✅ Safari extension project ready at: ${OUTPUT_DIR}/"
echo ""
echo "Next steps:"
echo "  1. Open the Xcode project:"
echo "       open \"${OUTPUT_DIR}/${APP_NAME}/${APP_NAME}.xcodeproj\""
echo ""
echo "  2. In Xcode: Signing & Capabilities → Team → select your Apple"
echo "     Developer account (personal team is fine for local debug)"
echo ""
echo "  3. Build and run (Cmd+R)"
echo ""
echo "  4. Enable extension: Safari → Settings → Extensions → ${APP_NAME}"
echo ""
echo "  For local testing without App Store signing:"
echo "    Safari → Settings → Advanced → Show Develop menu"
echo "    Develop → Allow Unsigned Extensions"
echo ""
echo "  ⚠️  BEFORE any App Store submission:"
echo "    - Load the extension in Safari and visually verify it works"
echo "    - Check Web Inspector → Develop → Web Extension Background Pages"
echo "      for any console errors"
echo "    - Confirm telemetry.local.js is NOT in the built .appex bundle"
