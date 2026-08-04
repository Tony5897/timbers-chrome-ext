import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const options = parseArguments(process.argv.slice(2));
const results = [];

checkVersion('Node.js', process.versions.node, 22);
checkCommandVersion('Java', 'java', ['-version'], 21);
checkCommandVersion('Firebase CLI', path.join(rootDirectory, 'node_modules', '.bin', 'firebase'), ['--version'], 15);

const packageJson = readJson('package.json');
const manifest = readJson('manifest.json');
check('release versions agree', manifest.version === packageJson.version, {
  packageVersion: packageJson.version,
  manifestVersion: manifest.version,
});

const runtimeConfigSource = readText('runtime-config.js');
const runtimeConfig = {
  projectId: capture(runtimeConfigSource, /projectId:\s*'([^']+)'/),
  apiBaseUrl: capture(runtimeConfigSource, /apiBaseUrl:\s*'([^']+)'/),
  clientVersion: capture(runtimeConfigSource, /clientVersion:\s*'([^']+)'/),
};
check('runtime client version agrees', runtimeConfig.clientVersion === packageJson.version, runtimeConfig);

const apiSource = readText('services/api/src/index.ts');
const functionsRegion = capture(apiSource, /region:\s*'([^']+)'/);
let runtimeApiUrl;
try {
  runtimeApiUrl = new URL(runtimeConfig.apiBaseUrl);
  check('runtime API uses HTTPS', runtimeApiUrl.protocol === 'https:', { protocol: runtimeApiUrl.protocol });
} catch {
  check('runtime API URL is valid', false, { apiBaseUrl: runtimeConfig.apiBaseUrl });
}

if (runtimeApiUrl) {
  const expectedHost = `${functionsRegion}-${runtimeConfig.projectId}.cloudfunctions.net`;
  check('runtime API matches production project and region', runtimeApiUrl.hostname === expectedHost, {
    expectedHost,
    actualHost: runtimeApiUrl.hostname,
  });
}

for (const requiredFile of [
  'firebase.json',
  'firebase.final.json',
  'firestore.indexes.json',
  'firestore.rules',
  'firestore.rules.final',
]) {
  check(`required deployment file exists: ${requiredFile}`, fs.existsSync(path.join(rootDirectory, requiredFile)));
}

const firebaseAliases = readJson('.firebaserc').projects ?? {};
check('production alias matches runtime project', firebaseAliases.production === runtimeConfig.projectId, {
  productionAlias: firebaseAliases.production ?? null,
  runtimeProjectId: runtimeConfig.projectId,
});

if (options.requireEnvironments) {
  const projectIds = ['development', 'staging', 'production'].map((alias) => firebaseAliases[alias]);
  for (const alias of ['development', 'staging', 'production']) {
    check(`Firebase alias configured: ${alias}`, Boolean(firebaseAliases[alias]), {
      projectId: firebaseAliases[alias] ?? null,
    });
  }
  check('Firebase environment project IDs are distinct', projectIds.every(Boolean) && new Set(projectIds).size === 3, {
    aliases: Object.fromEntries(['development', 'staging', 'production'].map((alias) => [alias, firebaseAliases[alias] ?? null])),
  });
}

let deploymentProjectId = null;
if (options.targetEnvironment) {
  const allowedEnvironment = ['staging', 'production'].includes(options.targetEnvironment);
  check('deployment target environment is allowed', allowedEnvironment, {
    targetEnvironment: options.targetEnvironment,
  });
  deploymentProjectId = allowedEnvironment ? firebaseAliases[options.targetEnvironment] ?? null : null;
  check('deployment target has a Firebase project alias', Boolean(deploymentProjectId), {
    targetEnvironment: options.targetEnvironment,
    projectId: deploymentProjectId,
  });
}

if (options.commitSha) {
  const actualCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  }).trim();
  check('deployment commit SHA is valid', /^[0-9a-f]{40}$/.test(options.commitSha), {
    commitSha: options.commitSha,
  });
  check('deployment commit matches checkout', options.commitSha === actualCommitSha, {
    expectedCommitSha: options.commitSha,
    actualCommitSha,
  });
}

if (options.requireBackupEvidence || options.backupUri || options.backupSha256) {
  verifyExternalBackupEvidence(options);
}

if (options.requireCloudAccess) verifyCloudAccess(deploymentProjectId);

if (options.backup) verifyBackup(options.backup);
if (options.requireBackup && !options.backup) {
  check('legacy backup supplied for verification', false, { expectedFlag: '--backup <path>' });
}

if (options.requireClean) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  }).trim();
  check('Git worktree is clean', status.length === 0, { changedEntries: status ? status.split('\n').length : 0 });
}

const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  releaseVersion: packageJson.version,
  functionsRegion,
  runtimeProjectId: runtimeConfig.projectId,
  targetEnvironment: options.targetEnvironment,
  targetProjectId: deploymentProjectId,
  commitSha: options.commitSha,
  backupEvidence: options.backupUri && options.backupSha256
    ? { uri: options.backupUri, sha256: options.backupSha256.toLowerCase() }
    : null,
  results,
  summary: summarize(results),
};

if (options.output) {
  const outputPath = path.resolve(options.output);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

for (const result of results) {
  process.stdout.write(`${result.status.toUpperCase()} ${result.name}\n`);
}
process.stdout.write(`Phase 0 preflight: ${report.summary.passed} passed, ${report.summary.failed} failed\n`);
if (report.summary.failed > 0) process.exitCode = 1;

function parseArguments(values) {
  const parsed = {
    requireBackup: false,
    requireCloudAccess: false,
    requireClean: false,
    requireEnvironments: false,
    requireBackupEvidence: false,
    backup: null,
    backupUri: null,
    backupSha256: null,
    commitSha: null,
    output: null,
    targetEnvironment: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--require-backup') parsed.requireBackup = true;
    else if (value === '--require-cloud-access') parsed.requireCloudAccess = true;
    else if (value === '--require-clean') parsed.requireClean = true;
    else if (value === '--require-environments') parsed.requireEnvironments = true;
    else if (value === '--require-backup-evidence') parsed.requireBackupEvidence = true;
    else if (['--backup', '--backup-uri', '--backup-sha256', '--commit-sha', '--output', '--target-environment'].includes(value)) {
      const argument = values[index + 1];
      if (!argument) throw new Error(`${value} requires a value.`);
      const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      parsed[key] = argument;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}

function check(name, condition, details = {}) {
  results.push({ name, status: condition ? 'passed' : 'failed', details });
}

function checkVersion(name, rawVersion, minimumMajor) {
  const major = majorVersion(rawVersion);
  check(`${name} ${minimumMajor}+`, major !== null && major >= minimumMajor, {
    detectedVersion: rawVersion,
    minimumMajor,
  });
}

function checkCommandVersion(name, command, commandArguments, minimumMajor) {
  const temporaryConfigDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'matchday-preflight-'));
  const result = spawnSync(command, commandArguments, {
    encoding: 'utf8',
    env: {
      ...process.env,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
      XDG_CONFIG_HOME: temporaryConfigDirectory,
    },
  });
  fs.rmSync(temporaryConfigDirectory, { recursive: true, force: true });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  const detected = output.match(/\d+(?:\.\d+){0,3}/)?.[0] ?? null;
  check(`${name} ${minimumMajor}+`, result.status === 0 && majorVersion(detected) >= minimumMajor, {
    detectedVersion: detected,
    minimumMajor,
    commandAvailable: result.error?.code !== 'ENOENT',
  });
}

function majorVersion(version) {
  if (!version) return null;
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  return Number.isInteger(major) ? major : null;
}

function verifyBackup(backupArgument) {
  const backupPath = path.resolve(backupArgument);
  const checksumPath = `${backupPath}.sha256`;
  check('legacy backup exists', fs.existsSync(backupPath), { path: backupPath });
  check('legacy backup checksum exists', fs.existsSync(checksumPath), { path: checksumPath });
  if (!fs.existsSync(backupPath) || !fs.existsSync(checksumPath)) return;

  const expectedDigest = readFirstToken(checksumPath);
  const actualDigest = createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
  check('legacy backup checksum matches', expectedDigest === actualDigest, {
    expectedDigest,
    actualDigest,
  });

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check('legacy backup retains source classification', backup.classification === 'legacy_unverified', {
    classification: backup.classification ?? null,
  });
  const hasRecordArray = Array.isArray(backup.records);
  const hasRecordCount = Number.isSafeInteger(backup.recordCount) && backup.recordCount >= 0;
  check('legacy backup contains a records array', hasRecordArray, {
    actualType: hasRecordArray ? 'array' : typeof backup.records,
  });
  check('legacy backup contains a non-negative record count', hasRecordCount, {
    declaredCount: backup.recordCount ?? null,
  });
  check('legacy backup count agrees with records', hasRecordArray && hasRecordCount && backup.recordCount === backup.records.length, {
    declaredCount: backup.recordCount ?? null,
    actualCount: hasRecordArray ? backup.records.length : null,
  });
}

function verifyExternalBackupEvidence(values) {
  check('immutable legacy backup URI is valid', /^(gs|https):\/\/\S+$/.test(values.backupUri ?? ''), {
    uri: values.backupUri,
  });
  check('legacy backup SHA-256 is valid', /^[0-9a-fA-F]{64}$/.test(values.backupSha256 ?? ''), {
    sha256: values.backupSha256,
  });
}

function verifyCloudAccess(expectedProjectId) {
  const firebaseArguments = expectedProjectId
    ? ['projects:list', '--json', '--non-interactive']
    : ['login:list'];
  const firebaseResult = spawnSync(path.join(rootDirectory, 'node_modules', '.bin', 'firebase'), firebaseArguments, {
    encoding: 'utf8',
    env: process.env,
  });
  const firebaseOutput = `${firebaseResult.stdout ?? ''}\n${firebaseResult.stderr ?? ''}`;
  let firebaseAuthorized = firebaseResult.status === 0 && !/No authorized accounts/i.test(firebaseOutput);
  if (firebaseAuthorized && expectedProjectId) {
    try {
      const projectResult = JSON.parse(firebaseResult.stdout);
      const projects = Array.isArray(projectResult.result) ? projectResult.result : [];
      firebaseAuthorized = projects.some((project) => project.projectId === expectedProjectId);
    } catch {
      firebaseAuthorized = false;
    }
  }
  check('Firebase CLI can access the deployment project', firebaseAuthorized, {
    projectId: expectedProjectId,
  });

  const gcloudResult = spawnSync(
    'gcloud',
    ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
    { encoding: 'utf8', env: process.env },
  );
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasApplicationDefaultCredentials = Boolean(adcPath && fs.existsSync(adcPath));
  check('Google Cloud credentials are available', hasApplicationDefaultCredentials || (gcloudResult.status === 0 && gcloudResult.stdout.trim().length > 0), {
    commandAvailable: gcloudResult.error?.code !== 'ENOENT',
    applicationDefaultCredentials: hasApplicationDefaultCredentials,
  });
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');
}

function capture(value, pattern) {
  return pattern.exec(value)?.[1] ?? '';
}

function readFirstToken(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\s+/)[0];
}

function summarize(entries) {
  return {
    passed: entries.filter((entry) => entry.status === 'passed').length,
    failed: entries.filter((entry) => entry.status === 'failed').length,
  };
}
