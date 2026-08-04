import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger, setGlobalOptions } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createApiHandler } from './http.js';
import { deleteScheduledAnonymousAccounts } from './account-cleanup.js';
import { PublicReadService } from './public-read-service.js';
import { PollReadService } from './poll-read-service.js';
import { FirestoreCompatibilityRepository } from './repository.js';
import { CompatibilityPollService } from './service.js';

if (getApps().length === 0) initializeApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 30,
});

const repository = new FirestoreCompatibilityRepository(getFirestore());
const service = new CompatibilityPollService(repository);
const publicReadService = new PublicReadService();
const pollReadService = new PollReadService(service);
const handler = createApiHandler({
  service,
  publicReadService,
  pollReadService,
  verifyIdToken: (token) => getAuth().verifyIdToken(token, true),
});

export const api = onRequest({ cors: true }, async (request, response) => {
  await handler(request, response);
});

export const syncCompatibilityPollWindows = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Los_Angeles',
    retryCount: 1,
  },
  async () => {
    const count = await service.syncPollWindows();
    logger.info('compatibility_poll_windows_synced', { count });
  },
);

export const cleanupCompatibilityResponses = onSchedule(
  {
    schedule: 'every day 04:15',
    timeZone: 'America/Los_Angeles',
    retryCount: 1,
    timeoutSeconds: 300,
  },
  async () => {
    const firestore = getFirestore();
    let deleted = 0;

    for (let batchNumber = 0; batchNumber < 10; batchNumber += 1) {
      const snapshot = await firestore
        .collectionGroup('responses')
        .where('expiresAt', '<=', new Date())
        .limit(500)
        .get();
      if (snapshot.empty) break;

      const writer = firestore.bulkWriter();
      for (const response of snapshot.docs) writer.delete(response.ref);
      await writer.close();
      deleted += snapshot.size;
    }

    for (let batchNumber = 0; batchNumber < 10; batchNumber += 1) {
      const snapshot = await firestore
        .collection('compatibilityRateLimits')
        .where('expiresAt', '<=', new Date())
        .limit(500)
        .get();
      if (snapshot.empty) break;

      const writer = firestore.bulkWriter();
      for (const rateLimit of snapshot.docs) writer.delete(rateLimit.ref);
      await writer.close();
      deleted += snapshot.size;
    }

    logger.info('compatibility_responses_deleted', { deleted });
  },
);

export const cleanupCompatibilityAccounts = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Los_Angeles',
    retryCount: 2,
  },
  async () => {
    const deleted = await deleteScheduledAnonymousAccounts(getFirestore(), getAuth());
    logger.info('compatibility_accounts_deleted', { deleted });
  },
);
