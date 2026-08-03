import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_NAMES = [
  /^\.env(?:\.|$)/,
  /service[-_.]?account/i,
  /telemetry\.local\.js$/,
  /\.map$/,
  /firebase-tools\.json$/,
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"type"\s*:\s*"service_account"/,
  /"private_key"\s*:/,
];

export function readProjectMetadata(rootDirectory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'manifest.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'));
  return { manifest, packageJson };
}

export function collectExtensionFiles(rootDirectory) {
  const { manifest } = readProjectMetadata(rootDirectory);
  const files = new Set(['manifest.json']);
  const queue = [];

  const addReference = (reference) => {
    if (!reference || isExternalReference(reference)) return;
    const normalized = normalizeReference(reference);
    if (!normalized) return;
    const absolutePath = path.join(rootDirectory, normalized);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing extension runtime dependency: ${normalized}`);
    }
    if (fs.statSync(absolutePath).isDirectory()) {
      for (const child of walkDirectory(absolutePath)) {
        addReference(path.relative(rootDirectory, child));
      }
      return;
    }
    if (!files.has(normalized)) {
      files.add(normalized);
      queue.push(normalized);
    }
  };

  addReference(manifest.background?.service_worker);
  addReference(manifest.action?.default_popup);
  for (const icon of Object.values(manifest.icons ?? {})) addReference(icon);
  for (const icon of Object.values(manifest.action?.default_icon ?? {})) addReference(icon);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const extension = path.extname(current).toLowerCase();
    const content = fs.readFileSync(path.join(rootDirectory, current), 'utf8');

    if (extension === '.html') {
      for (const match of content.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        addReference(match[1]);
      }
    }
    if (extension === '.js') {
      for (const match of content.matchAll(/importScripts\(\s*["']([^"']+)["']\s*\)/g)) {
        addReference(match[1]);
      }
      for (const match of content.matchAll(/runtime\.getURL\(\s*["']([^"']+)["']\s*\)/g)) {
        addReference(match[1]);
      }
    }
    if (extension === '.css') {
      for (const match of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        addReference(match[1]);
      }
    }
  }

  return [...files].sort();
}

export function verifyExtensionDirectory(rootDirectory, packageDirectory) {
  const expectedFiles = collectExtensionFiles(rootDirectory);
  const actualFiles = walkDirectory(packageDirectory)
    .map((file) => path.relative(packageDirectory, file))
    .sort();

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error([
      'Extension package inventory differs from runtime dependencies.',
      `Expected: ${expectedFiles.join(', ')}`,
      `Actual: ${actualFiles.join(', ')}`,
    ].join('\n'));
  }

  const { manifest, packageJson } = readProjectMetadata(rootDirectory);
  if (manifest.version !== packageJson.version) {
    throw new Error(`Version mismatch: manifest ${manifest.version}, package ${packageJson.version}`);
  }

  for (const relativePath of actualFiles) {
    if (FORBIDDEN_NAMES.some((pattern) => pattern.test(relativePath))) {
      throw new Error(`Forbidden file in extension package: ${relativePath}`);
    }
    const content = fs.readFileSync(path.join(packageDirectory, relativePath));
    const text = content.toString('utf8');
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error(`Secret-like material detected in extension package: ${relativePath}`);
    }
  }

  const htmlFiles = actualFiles.filter((file) => file.endsWith('.html'));
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(path.join(packageDirectory, htmlFile), 'utf8');
    if (/<script[^>]+src=["']https?:/i.test(html)) {
      throw new Error(`Remotely hosted executable code detected in ${htmlFile}`);
    }
  }

  return expectedFiles;
}

export function walkDirectory(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkDirectory(entryPath));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function normalizeReference(reference) {
  return reference.split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
}

function isExternalReference(reference) {
  return /^(?:https?:|data:|mailto:|#)/i.test(reference);
}
