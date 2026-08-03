#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_CONFIG_HOME="$ROOT_DIR/.local/firebase-config"
mkdir -p "$XDG_CONFIG_HOME"

if ! java -version >/dev/null 2>&1 && [[ -x /usr/local/opt/openjdk@21/bin/java ]]; then
  export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  export PATH="/usr/local/opt/openjdk@21/bin:$PATH"
fi

if ! java -version >/dev/null 2>&1; then
  echo "Java 21+ is required for the Firestore emulator." >&2
  exit 1
fi

cd "$ROOT_DIR"
firebase emulators:exec \
  --only firestore \
  --project demo-timbers-matchday \
  "jest --config jest.rules.config.js --runInBand"
