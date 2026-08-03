const { deleteApp, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { hashIdentity, pollIdForTimestamp, RAW_RESPONSE_RETENTION_MS } = require('../lib/domain.js');
const { FirestoreCompatibilityRepository } = require('../lib/repository.js');

let app;
let firestore;
let repository;

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-timbers-matchday-repository' }, 'repository-emulator-test');
  firestore = getFirestore(app);
  repository = new FirestoreCompatibilityRepository(firestore);
});

afterAll(async () => {
  await deleteApp(app);
});

test('transactionally enforces one response per UID and maintains aggregate shards', async () => {
  const matchTimestamp = 1786156200000;
  const pollId = pollIdForTimestamp(matchTimestamp);
  await firestore.collection('compatibilityPolls').doc(pollId).set({
    matchTimestamp,
    providerEventId: 'fixture-timbers-001',
    opensAt: Timestamp.fromMillis(matchTimestamp - 72 * 60 * 60 * 1000),
    closesAt: Timestamp.fromMillis(matchTimestamp),
  });

  const first = await repository.submitResponse({
    matchTimestamp,
    uid: 'anonymous-a',
    choice: 'high',
    clientVersion: '1.0.5',
    idempotencyKey: 'request-key-00000001',
  });
  const duplicate = await repository.submitResponse({
    matchTimestamp,
    uid: 'anonymous-a',
    choice: 'low',
    clientVersion: '1.0.5',
    idempotencyKey: 'request-key-00000002',
  });
  await repository.submitResponse({
    matchTimestamp,
    uid: 'anonymous-b',
    choice: 'medium',
    clientVersion: '1.0.5',
    idempotencyKey: 'request-key-00000003',
  });

  expect(first).toEqual({ status: 'accepted', choice: 'high' });
  expect(duplicate).toEqual({ status: 'existing', choice: 'high' });
  await expect(repository.getAggregate(matchTimestamp)).resolves.toEqual({
    high: 1,
    medium: 1,
    low: 0,
    total: 2,
  });

  const response = await firestore
    .collection('compatibilityPolls')
    .doc(pollId)
    .collection('responses')
    .doc('anonymous-a')
    .get();
  expect(response.get('idempotencyKeyHash')).toMatch(/^[a-f0-9]{64}$/);
  expect(response.get('idempotencyKeyHash')).not.toBe('request-key-00000001');
  expect(response.get('expiresAt').toMillis()).toBe(matchTimestamp + RAW_RESPONSE_RETENTION_MS);
});

test('resolves one nearby legacy kickoff timestamp to the canonical poll window', async () => {
  const matchTimestamp = 1786500000000;
  const pollId = pollIdForTimestamp(matchTimestamp);
  await firestore.collection('compatibilityPolls').doc(pollId).set({
    matchTimestamp,
    providerEventId: 'fixture-nearby-001',
    opensAt: Timestamp.fromMillis(matchTimestamp - 72 * 60 * 60 * 1000),
    closesAt: Timestamp.fromMillis(matchTimestamp),
  });

  await expect(repository.getPollWindow(matchTimestamp + 30 * 60 * 1000)).resolves.toEqual({
    pollId,
    canonicalPollId: 'poll-espn-fixture-nearby-001-confidence-v1',
    matchId: 'espn-fixture-nearby-001',
    teamId: 'timbers',
    matchTimestamp,
    matchStatus: 'scheduled',
    providerEventId: 'fixture-nearby-001',
    opensAtMs: matchTimestamp - 72 * 60 * 60 * 1000,
    closesAtMs: matchTimestamp,
  });
});

test('persists and resolves canonical poll aliases without changing legacy storage IDs', async () => {
  const matchTimestamp = 1786600000000;
  const window = {
    pollId: pollIdForTimestamp(matchTimestamp),
    canonicalPollId: 'poll-espn-fixture-canonical-001-confidence-v1',
    matchId: 'espn-fixture-canonical-001',
    teamId: 'timbers',
    matchTimestamp,
    matchStatus: 'scheduled',
    providerEventId: 'fixture-canonical-001',
    opensAtMs: matchTimestamp - 72 * 60 * 60 * 1000,
    closesAtMs: matchTimestamp,
  };

  await repository.upsertPollWindows([window]);

  await expect(repository.getPollWindowByCanonicalId(window.canonicalPollId)).resolves.toEqual(window);
  const stored = await firestore.collection('compatibilityPolls').doc(window.pollId).get();
  expect(stored.get('canonicalPollId')).toBe(window.canonicalPollId);
  expect(stored.get('matchId')).toBe(window.matchId);
  expect(stored.get('teamId')).toBe('timbers');
  expect(stored.get('matchStatus')).toBe('scheduled');
});

test('resolves canonical poll IDs against pre-alias compatibility documents', async () => {
  const matchTimestamp = 1786700000000;
  const pollId = pollIdForTimestamp(matchTimestamp);
  await firestore.collection('compatibilityPolls').doc(pollId).set({
    matchTimestamp,
    providerEventId: 'fixture-legacy-alias-001',
    opensAt: Timestamp.fromMillis(matchTimestamp - 72 * 60 * 60 * 1000),
    closesAt: Timestamp.fromMillis(matchTimestamp),
  });

  await expect(repository.getPollWindowByCanonicalId(
    'poll-espn-fixture-legacy-alias-001-confidence-v1',
  )).resolves.toEqual({
    pollId,
    canonicalPollId: 'poll-espn-fixture-legacy-alias-001-confidence-v1',
    matchId: 'espn-fixture-legacy-alias-001',
    teamId: 'timbers',
    matchTimestamp,
    matchStatus: 'scheduled',
    providerEventId: 'fixture-legacy-alias-001',
    opensAtMs: matchTimestamp - 72 * 60 * 60 * 1000,
    closesAtMs: matchTimestamp,
  });
});

test('fails closed when a stored canonical poll alias disagrees with its match ID', async () => {
  const matchTimestamp = 1786800000000;
  const canonicalPollId = 'poll-espn-fixture-mismatch-001-confidence-v1';
  await firestore.collection('compatibilityPolls').doc(pollIdForTimestamp(matchTimestamp)).set({
    canonicalPollId,
    matchId: 'espn-different-match-001',
    teamId: 'timbers',
    matchTimestamp,
    providerEventId: 'fixture-mismatch-001',
    opensAt: Timestamp.fromMillis(matchTimestamp - 72 * 60 * 60 * 1000),
    closesAt: Timestamp.fromMillis(matchTimestamp),
  });

  await expect(repository.getPollWindowByCanonicalId(canonicalPollId)).rejects.toThrow(
    'invalid_poll_window',
  );
});

test('treats unsupported canonical poll providers as not found', async () => {
  await expect(repository.getPollWindowByCanonicalId(
    'poll-other-fixture-unsupported-001-confidence-v1',
  )).resolves.toBeNull();
});

test('limits one anonymous UID to ten accepted responses per UTC day', async () => {
  const baseTimestamp = 1787000000000;
  for (let index = 0; index < 11; index += 1) {
    const matchTimestamp = baseTimestamp + index;
    const pollId = pollIdForTimestamp(matchTimestamp);
    await firestore.collection('compatibilityPolls').doc(pollId).set({
      matchTimestamp,
      providerEventId: `fixture-rate-${index}`,
      opensAt: Timestamp.fromMillis(matchTimestamp - 1),
      closesAt: Timestamp.fromMillis(matchTimestamp + 1),
    });
  }

  for (let index = 0; index < 10; index += 1) {
    await expect(repository.submitResponse({
      matchTimestamp: baseTimestamp + index,
      uid: 'anonymous-rate-limited',
      choice: 'high',
      clientVersion: '1.0.5',
      idempotencyKey: `request-rate-key-${String(index).padStart(2, '0')}`,
    })).resolves.toEqual({ status: 'accepted', choice: 'high' });
  }

  await expect(repository.submitResponse({
    matchTimestamp: baseTimestamp + 10,
    uid: 'anonymous-rate-limited',
    choice: 'high',
    clientVersion: '1.0.5',
    idempotencyKey: 'request-rate-key-10',
  })).rejects.toThrow('rate_limited');
});

test('deletes retained responses idempotently and corrects aggregate shards', async () => {
  const firstTimestamp = 1788000000000;
  const secondTimestamp = firstTimestamp + 1;
  for (const [matchTimestamp, providerEventId] of [
    [firstTimestamp, 'fixture-delete-1'],
    [secondTimestamp, 'fixture-delete-2'],
  ]) {
    await firestore.collection('compatibilityPolls').doc(pollIdForTimestamp(matchTimestamp)).set({
      matchTimestamp,
      providerEventId,
      opensAt: Timestamp.fromMillis(matchTimestamp - 1),
      closesAt: Timestamp.fromMillis(matchTimestamp + 1),
    });
  }

  await repository.submitResponse({
    matchTimestamp: firstTimestamp,
    uid: 'anonymous-delete-me',
    choice: 'high',
    clientVersion: '1.0.5',
    idempotencyKey: 'delete-request-key-01',
  });
  await repository.submitResponse({
    matchTimestamp: firstTimestamp,
    uid: 'anonymous-keep-me',
    choice: 'low',
    clientVersion: '1.0.5',
    idempotencyKey: 'delete-request-key-02',
  });
  await repository.submitResponse({
    matchTimestamp: secondTimestamp,
    uid: 'anonymous-delete-me',
    choice: 'medium',
    clientVersion: '1.0.5',
    idempotencyKey: 'delete-request-key-03',
  });

  const firstReceipt = await repository.requestInstallationDeletion('anonymous-delete-me');
  const repeatedReceipt = await repository.requestInstallationDeletion('anonymous-delete-me');

  expect(repeatedReceipt).toEqual(firstReceipt);
  await expect(repository.getAggregate(firstTimestamp)).resolves.toEqual({
    high: 0,
    medium: 0,
    low: 1,
    total: 1,
  });
  await expect(repository.getAggregate(secondTimestamp)).resolves.toEqual({
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  });

  const retainedResponses = await firestore
    .collectionGroup('responses')
    .where('identityHash', '==', hashIdentity('anonymous-delete-me'))
    .get();
  expect(retainedResponses.empty).toBe(true);

  const deletionRequest = await firestore
    .collection('compatibilityDeletionRequests')
    .doc(hashIdentity('anonymous-delete-me'))
    .get();
  expect(deletionRequest.get('status')).toBe('completed');

  await expect(repository.submitResponse({
    matchTimestamp: secondTimestamp,
    uid: 'anonymous-delete-me',
    choice: 'low',
    clientVersion: '1.0.5',
    idempotencyKey: 'delete-request-key-04',
  })).rejects.toThrow('installation_deletion_pending');
});
