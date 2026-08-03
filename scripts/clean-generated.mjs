import { rm } from 'node:fs/promises';

const generatedPaths = [
  'coverage',
  'dist',
  'firebase-debug.log',
  'firestore-debug.log',
  'packages/contracts/lib',
  'packages/domain/lib',
  'services/api/lib',
];

await Promise.all(generatedPaths.map((generatedPath) => rm(generatedPath, {
  force: true,
  recursive: true,
})));
