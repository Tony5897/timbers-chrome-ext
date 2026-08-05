#!/usr/bin/env node
/**
 * Restores services/api/package.json after Functions packaging/deploy so local
 * npm workspaces keep version-pinned @matchday dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(rootDirectory, 'services/api');
const packageJsonPath = path.join(apiDirectory, 'package.json');
const packageBackupPath = path.join(apiDirectory, 'package.json.workspace');
const packageLockPath = path.join(apiDirectory, 'package-lock.json');
const vendorDirectory = path.join(apiDirectory, 'vendor');

if (fs.existsSync(packageBackupPath)) {
  fs.copyFileSync(packageBackupPath, packageJsonPath);
  fs.rmSync(packageBackupPath, { force: true });
}

fs.rmSync(vendorDirectory, { recursive: true, force: true });
fs.rmSync(packageLockPath, { force: true });

console.log('Restored services/api workspace package manifests after Functions deploy staging.');
