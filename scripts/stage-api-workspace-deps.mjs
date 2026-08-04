#!/usr/bin/env node
/**
 * Firebase Functions uploads only services/api. Cloud Build then runs npm install
 * against that package alone, so workspace packages must be vendored as file:
 * dependencies before packaging.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(rootDirectory, 'services/api');
const vendorDirectory = path.join(apiDirectory, 'vendor');
const packageJsonPath = path.join(apiDirectory, 'package.json');
const packageBackupPath = path.join(apiDirectory, 'package.json.workspace');

const workspacePackages = [
  {
    name: 'contracts',
    source: path.join(rootDirectory, 'packages/contracts'),
    rewriteDependencies: null,
  },
  {
    name: 'domain',
    source: path.join(rootDirectory, 'packages/domain'),
    rewriteDependencies: {
      '@matchday/contracts': 'file:../contracts',
    },
  },
];

function copyBuiltPackage({ name, source, rewriteDependencies }) {
  const destination = path.join(vendorDirectory, name);
  const sourcePackageJsonPath = path.join(source, 'package.json');
  const sourceLibDirectory = path.join(source, 'lib');

  if (!fs.existsSync(sourcePackageJsonPath)) {
    throw new Error(`Missing package manifest: ${sourcePackageJsonPath}`);
  }
  if (!fs.existsSync(sourceLibDirectory)) {
    throw new Error(`Missing built package output: ${sourceLibDirectory}`);
  }

  fs.mkdirSync(destination, { recursive: true });
  const packageJson = JSON.parse(fs.readFileSync(sourcePackageJsonPath, 'utf8'));
  if (rewriteDependencies) {
    packageJson.dependencies = {
      ...packageJson.dependencies,
      ...rewriteDependencies,
    };
  }

  fs.writeFileSync(`${destination}/package.json`, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.cpSync(sourceLibDirectory, path.join(destination, 'lib'), { recursive: true });
}

execFileSync('npm', ['run', 'build:packages'], {
  cwd: rootDirectory,
  stdio: 'inherit',
});

fs.rmSync(vendorDirectory, { recursive: true, force: true });
fs.mkdirSync(vendorDirectory, { recursive: true });

for (const workspacePackage of workspacePackages) {
  copyBuiltPackage(workspacePackage);
}

if (!fs.existsSync(packageBackupPath)) {
  fs.copyFileSync(packageJsonPath, packageBackupPath);
}

const packageJson = JSON.parse(fs.readFileSync(packageBackupPath, 'utf8'));
packageJson.dependencies = {
  ...packageJson.dependencies,
  '@matchday/contracts': 'file:./vendor/contracts',
  '@matchday/domain': 'file:./vendor/domain',
};
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log('Staged @matchday workspace packages into services/api/vendor for Functions deploy.');
