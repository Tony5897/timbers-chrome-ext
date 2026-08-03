import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readProjectMetadata, verifyExtensionDirectory } from './extension-artifact.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const { packageJson } = readProjectMetadata(rootDirectory);
const zipPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(rootDirectory, 'dist', `timbers-matchday-v${packageJson.version}.zip`);

if (!fs.existsSync(zipPath)) throw new Error(`Extension ZIP not found: ${zipPath}`);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'matchday-extension-'));
try {
  execFileSync('unzip', ['-q', zipPath, '-d', temporaryDirectory]);
  const files = verifyExtensionDirectory(rootDirectory, temporaryDirectory);
  process.stdout.write(`Verified ${files.length} packaged runtime files in ${zipPath}\n`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
