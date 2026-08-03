import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const argumentsByName = parseArguments(process.argv.slice(2));
const projectId = argumentsByName.project ?? 'timbers-matchday';
const apiKey = argumentsByName['api-key'] ?? process.env.FIREBASE_WEB_API_KEY;
const output = argumentsByName.output;

if (!apiKey || !output) {
  throw new Error('Usage: npm run export:legacy -- --output <path> --api-key <public Firebase web API key> [--project <id>]');
}

const records = [];
let pageToken = '';
do {
  const endpoint = new URL(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/votes`,
  );
  endpoint.searchParams.set('pageSize', '1000');
  endpoint.searchParams.set('key', apiKey);
  if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Legacy export failed with HTTP ${response.status}.`);
  const payload = await response.json();
  for (const document of payload.documents ?? []) records.push(normalizeDocument(document));
  pageToken = payload.nextPageToken ?? '';
} while (pageToken);

records.sort((left, right) => left.documentId.localeCompare(right.documentId));
const artifact = {
  schemaVersion: 1,
  classification: 'legacy_unverified',
  projectId,
  database: '(default)',
  collection: 'votes',
  exportedAt: new Date().toISOString(),
  caveat: 'Public legacy totals collected before authenticated integrity controls. Do not merge with integrity_controlled data.',
  recordCount: records.length,
  anomalyCount: records.filter((record) => record.anomalies.length > 0).length,
  records,
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
const absoluteOutput = path.resolve(output);
fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
fs.writeFileSync(absoluteOutput, serialized, { flag: 'wx', mode: 0o600 });
const digest = createHash('sha256').update(serialized).digest('hex');
fs.writeFileSync(`${absoluteOutput}.sha256`, `${digest}  ${path.basename(absoluteOutput)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`Exported ${records.length} legacy_unverified documents to ${absoluteOutput}\nSHA-256 ${digest}\n`);
process.stdout.write(`Verify from ${path.dirname(absoluteOutput)} with: shasum -a 256 -c ${path.basename(absoluteOutput)}.sha256\n`);

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`Invalid argument near ${name ?? 'end of input'}.`);
    parsed[name.slice(2)] = value;
  }
  return parsed;
}

function normalizeDocument(document) {
  const id = String(document.name ?? '').split('/').pop();
  if (!id) throw new Error('A legacy document did not include an ID.');
  const fields = document.fields ?? {};
  const allowed = new Set(['high', 'medium', 'low']);
  const anomalies = [];
  if (!/^\d{13}$/.test(id)) anomalies.push('unexpected_document_id');
  for (const field of Object.keys(fields)) {
    if (!allowed.has(field)) anomalies.push(`unexpected_field:${field}`);
  }
  return {
    documentId: id,
    matchTimestamp: /^\d{13}$/.test(id) ? Number(id) : null,
    high: integerField(fields.high, id, 'high', anomalies),
    medium: integerField(fields.medium, id, 'medium', anomalies),
    low: integerField(fields.low, id, 'low', anomalies),
    anomalies,
    sourceFields: fields,
    createTime: document.createTime ?? null,
    updateTime: document.updateTime ?? null,
  };
}

function integerField(field, documentId, fieldName, anomalies) {
  if (!field) return 0;
  const value = Number(field.integerValue);
  if (!Number.isSafeInteger(value) || value < 0) {
    anomalies.push(`invalid_count:${fieldName}:${documentId}`);
    return null;
  }
  return value;
}
