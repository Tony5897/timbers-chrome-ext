#!/usr/bin/env python3
"""
cleanup-safari-resources.py
Remove non-extension files from the Safari Web Extension target's Copy Bundle
Resources build phase after xcrun safari-web-extension-converter runs.

Without this, the generated Xcode project includes node_modules, tests, zip
archives and other dev-only files in the extension bundle — making it huge
and unshippable.

Usage:
    python3 scripts/cleanup-safari-resources.py \
        "safari/Timbers Matchday/Timbers Matchday.xcodeproj/project.pbxproj"
"""
import re
import sys
import os

# ── Extension files that belong in the Safari bundle ────────────────────────
ALLOWED = {
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.js",
    "styles.css",
    "icon.png",
    "icons",
    "data",
    "telemetry.js",
    "telemetry.example.js",
}

# ── Explicit deny list (belt + suspenders) ───────────────────────────────────
DENIED = {
    "node_modules",
    "tests",
    "coverage",
    "scripts",
    "assets",
    ".github",
    ".claude",
    ".vscode",
    "safari",
    "safari-staging",
    "telemetry.local.js",
    "package.json",
    "package-lock.json",
    "babel.config.js",
    "jest.config.js",
    "jest.setup.js",
    "eslint.config.js",
    "README.md",
    "PRIVACY.md",
    "CONTRIBUTING.md",
    "LICENSE",
    ".gitignore",
    ".mailmap",
}


def extract_filename(comment):
    """Extract filename from a pbxproj comment like 'node_modules in Resources'."""
    m = re.match(r"^\s*(.+?)\s+in\s+Resources\s*$", comment)
    return m.group(1).strip() if m else None


def should_keep(filename):
    if filename is None:
        return True  # keep unknown entries to be safe
    base = filename.split("/")[0]
    if base in DENIED:
        return False
    if base.endswith(".zip"):
        return False
    if base.endswith(".log"):
        return False
    # Allow only explicitly-listed files; deny everything else
    return base in ALLOWED


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} path/to/project.pbxproj", file=sys.stderr)
        sys.exit(1)

    pbxproj_path = sys.argv[1]
    if not os.path.isfile(pbxproj_path):
        print(f"Error: {pbxproj_path} not found.", file=sys.stderr)
        sys.exit(1)

    with open(pbxproj_path, "r", encoding="utf-8") as f:
        content = f.read()

    # ── Step 1: find which PBXResourcesBuildPhase belongs to the extension ──
    # Locate the "Timbers Matchday Extension" PBXNativeTarget block and
    # pull out its Resources build phase UUID.
    # Anchored to "isa = PBXNativeTarget" to avoid accidentally matching a
    # PBXGroup or other block with the same name comment.
    target_block_re = re.compile(
        r"(/\*\s*Timbers Matchday Extension\s*\*/\s*=\s*\{.*?isa\s*=\s*PBXNativeTarget.*?buildPhases\s*=\s*\((.*?)\))",
        re.DOTALL,
    )
    target_match = target_block_re.search(content)
    if not target_match:
        print("Warning: could not find 'Timbers Matchday Extension' target — no changes made.")
        sys.exit(1)

    build_phases_block = target_match.group(2)
    # Extract UUID + comment pairs from the buildPhases list
    phase_entries = re.findall(r"([A-F0-9]{24})\s*/\*\s*([^*]+?)\s*\*/", build_phases_block)
    resources_uuid = None
    for uuid, comment in phase_entries:
        if comment.strip() == "Resources":
            resources_uuid = uuid
            break

    if not resources_uuid:
        print("Warning: could not locate Resources build phase UUID — no changes made.")
        sys.exit(1)

    print(f"  Extension Resources build phase: {resources_uuid}")

    # ── Step 2: find that PBXResourcesBuildPhase block and filter its files ──
    phase_block_re = re.compile(
        r"(" + re.escape(resources_uuid) + r"\s*/\*\s*Resources\s*\*/\s*=\s*\{[^}]*?files\s*=\s*\()(.*?)(\);[^}]*?\})",
        re.DOTALL,
    )
    phase_match = phase_block_re.search(content)
    if not phase_match:
        print("Warning: could not locate the Resources build phase block — no changes made.")
        sys.exit(1)

    files_block = phase_match.group(2)
    # Each entry is like: "UUID /* filename in Resources */,"
    entry_re = re.compile(r"(\s*[A-F0-9]{24}\s*/\*\s*[^*]+?\s*\*/\s*,?\s*)")
    entries = entry_re.findall(files_block)

    kept = []
    removed = []
    for entry in entries:
        comment_match = re.search(r"/\*\s*([^*]+?)\s*\*/", entry)
        comment = comment_match.group(1) if comment_match else None
        filename = extract_filename(comment)
        if should_keep(filename):
            kept.append(entry)
        else:
            removed.append(filename or comment or entry.strip())

    if not removed:
        print("  No unwanted entries found — project is already clean.")
        sys.exit(0)

    print(f"  Removing {len(removed)} unwanted entries:")
    for name in removed:
        print(f"    - {name}")
    print(f"  Keeping {len(kept)} extension entries.")

    # Rebuild the files block with only the kept entries
    new_files_block = "".join(kept)
    new_content = content[: phase_match.start(2)] + new_files_block + content[phase_match.end(2) :]

    with open(pbxproj_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print("  Wrote cleaned project.pbxproj")


if __name__ == "__main__":
    main()
