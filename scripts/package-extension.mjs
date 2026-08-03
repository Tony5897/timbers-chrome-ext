import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { collectExtensionFiles, readProjectMetadata, verifyExtensionDirectory } from './extension-artifact.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(rootDirectory, 'dist');
const packageDirectory = path.join(outputRoot, 'timbers-matchday');
const { packageJson } = readProjectMetadata(rootDirectory);
const zipPath = path.join(outputRoot, `timbers-matchday-v${packageJson.version}.zip`);

fs.rmSync(packageDirectory, { recursive: true, force: true });
fs.mkdirSync(packageDirectory, { recursive: true });

for (const relativePath of collectExtensionFiles(rootDirectory)) {
  const destination = path.join(packageDirectory, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(rootDirectory, relativePath), destination);
}

verifyExtensionDirectory(rootDirectory, packageDirectory);
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-q', '-r', zipPath, '.'], { cwd: packageDirectory });

process.stdout.write(`${zipPath}\n`);
