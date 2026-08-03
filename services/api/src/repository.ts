import {
  randomUUID,
} from 'node:crypto';
import {
  FieldValue,
  Firestore,
  Timestamp,
} from 'firebase-admin/firestore';
import {
  matchIdSchema,
  matchStatusSchema,
  pollIdSchema,
  teamIdSchema,
} from '@matchday/contracts';
import {
  confidencePollIdForMatch,
  matchIdForProvider,
  matchIdFromConfidencePollId,
  providerReferenceForMatchId,
} from '@matchday/domain';
import {
  AUTH_DELETION_DELAY_MS,
  DAILY_RESPONSE_LIMIT,
  dailyRateLimit,
  emptyAggregate,
  hashIdempotencyKey,
  hashIdentity,
  LEGACY_TIMESTAMP_TOLERANCE_MS,
  matchTimestampSchema,
  pollIdForTimestamp,
  RAW_RESPONSE_RETENTION_MS,
  shardForUid,
  type Aggregate,
  type PollWindow,
  type VoteChoice,
  voteChoiceSchema,
} from './domain.js';

export type SubmissionResult = {
  status: 'accepted' | 'existing';
  choice: VoteChoice;
};

export type DeletionReceipt = {
  receiptId: string;
  requestedAtMs: number;
};

export interface CompatibilityRepository {
  getPollWindow(matchTimestamp: number): Promise<PollWindow | null>;
  getPollWindowByCanonicalId(canonicalPollId: string): Promise<PollWindow | null>;
  upsertPollWindows(windows: PollWindow[]): Promise<void>;
  submitResponse(input: {
    matchTimestamp: number;
    uid: string;
    choice: VoteChoice;
    clientVersion: string;
    idempotencyKey: string;
  }): Promise<SubmissionResult>;
  getAggregate(matchTimestamp: number): Promise<Aggregate>;
  requestInstallationDeletion(uid: string): Promise<DeletionReceipt>;
}

export class FirestoreCompatibilityRepository implements CompatibilityRepository {
  constructor(
    private readonly firestore: Firestore,
    private readonly now: () => number = Date.now,
  ) {}

  async getPollWindow(matchTimestamp: number): Promise<PollWindow | null> {
    const pollId = pollIdForTimestamp(matchTimestamp);
    const snapshot = await this.firestore.collection('compatibilityPolls').doc(pollId).get();
    if (snapshot.exists) return pollWindowFromSnapshot(snapshot);

    const nearby = await this.firestore
      .collection('compatibilityPolls')
      .where('matchTimestamp', '>=', matchTimestamp - LEGACY_TIMESTAMP_TOLERANCE_MS)
      .where('matchTimestamp', '<=', matchTimestamp + LEGACY_TIMESTAMP_TOLERANCE_MS)
      .limit(2)
      .get();
    if (nearby.size !== 1) return null;
    const nearbySnapshot = nearby.docs[0];
    if (!nearbySnapshot) return null;
    return pollWindowFromSnapshot(nearbySnapshot);
  }

  async getPollWindowByCanonicalId(canonicalPollId: string): Promise<PollWindow | null> {
    const canonical = await this.firestore
      .collection('compatibilityPolls')
      .where('canonicalPollId', '==', canonicalPollId)
      .limit(2)
      .get();
    if (canonical.size === 1) {
      const snapshot = canonical.docs[0];
      return snapshot ? pollWindowFromSnapshot(snapshot) : null;
    }
    if (canonical.size > 1) throw new Error('poll_alias_ambiguous');

    const matchId = matchIdFromConfidencePollId(canonicalPollId);
    let providerEventId: string;
    try {
      ({ providerEventId } = providerReferenceForMatchId(matchId));
    } catch (error) {
      if (error instanceof Error && error.message === 'unsupported_match_provider') return null;
      throw error;
    }
    const compatibility = await this.firestore
      .collection('compatibilityPolls')
      .where('providerEventId', '==', providerEventId)
      .limit(2)
      .get();
    if (compatibility.size > 1) throw new Error('poll_alias_ambiguous');
    if (compatibility.size !== 1) return null;
    const snapshot = compatibility.docs[0];
    return snapshot ? pollWindowFromSnapshot(snapshot) : null;
  }

  async upsertPollWindows(windows: PollWindow[]): Promise<void> {
    const writes: Promise<FirebaseFirestore.WriteResult>[] = [];
    for (const window of windows) {
      writes.push(this.firestore.collection('compatibilityPolls').doc(window.pollId).set({
        teamId: window.teamId,
        matchId: window.matchId,
        canonicalPollId: window.canonicalPollId,
        matchStatus: window.matchStatus,
        pollType: 'confidence',
        pollVersion: 1,
        identityClass: 'integrity_controlled',
        matchTimestamp: window.matchTimestamp,
        provider: 'espn_bootstrap',
        providerEventId: window.providerEventId,
        opensAt: Timestamp.fromMillis(window.opensAtMs),
        closesAt: Timestamp.fromMillis(window.closesAtMs),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
    }
    await Promise.all(writes);
  }

  async submitResponse(input: {
    matchTimestamp: number;
    uid: string;
    choice: VoteChoice;
    clientVersion: string;
    idempotencyKey: string;
  }): Promise<SubmissionResult> {
    const pollId = pollIdForTimestamp(input.matchTimestamp);
    const pollRef = this.firestore.collection('compatibilityPolls').doc(pollId);
    const responseRef = pollRef.collection('responses').doc(input.uid);
    const shardRef = pollRef.collection('shards').doc(String(shardForUid(input.uid)).padStart(2, '0'));
    const rateLimit = dailyRateLimit(input.uid, this.now());
    const rateLimitRef = this.firestore.collection('compatibilityRateLimits').doc(rateLimit.id);
    const deletionRef = this.firestore.collection('compatibilityDeletionRequests').doc(hashIdentity(input.uid));

    return this.firestore.runTransaction(async (transaction) => {
      const [pollSnapshot, responseSnapshot, rateLimitSnapshot, deletionSnapshot] = await Promise.all([
        transaction.get(pollRef),
        transaction.get(responseRef),
        transaction.get(rateLimitRef),
        transaction.get(deletionRef),
      ]);
      if (!pollSnapshot.exists) throw new Error('poll_not_found');
      if (deletionSnapshot.exists) throw new Error('installation_deletion_pending');

      if (responseSnapshot.exists) {
        return {
          status: 'existing' as const,
          choice: responseSnapshot.get('choice') as VoteChoice,
        };
      }

      const dailyCount = Number(rateLimitSnapshot.get('count') ?? 0);
      if (!Number.isSafeInteger(dailyCount) || dailyCount >= DAILY_RESPONSE_LIMIT) {
        throw new Error('rate_limited');
      }

      transaction.create(responseRef, {
        choice: input.choice,
        clientVersion: input.clientVersion,
        identityClass: 'anonymous_firebase_uid',
        identityHash: hashIdentity(input.uid),
        idempotencyKeyHash: hashIdempotencyKey(input.idempotencyKey),
        submittedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(input.matchTimestamp + RAW_RESPONSE_RETENTION_MS),
      });
      transaction.set(shardRef, {
        [input.choice]: FieldValue.increment(1),
        total: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(rateLimitRef, {
        count: FieldValue.increment(1),
        expiresAt: Timestamp.fromMillis(rateLimit.expiresAtMs),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { status: 'accepted' as const, choice: input.choice };
    });
  }

  async getAggregate(matchTimestamp: number): Promise<Aggregate> {
    const pollId = pollIdForTimestamp(matchTimestamp);
    const snapshots = await this.firestore
      .collection('compatibilityPolls')
      .doc(pollId)
      .collection('shards')
      .get();

    return snapshots.docs.reduce<Aggregate>((aggregate, snapshot) => {
      const data = snapshot.data();
      aggregate.high += Number(data.high ?? 0);
      aggregate.medium += Number(data.medium ?? 0);
      aggregate.low += Number(data.low ?? 0);
      aggregate.total += Number(data.total ?? 0);
      return aggregate;
    }, emptyAggregate());
  }

  async requestInstallationDeletion(uid: string): Promise<DeletionReceipt> {
    const identityHash = hashIdentity(uid);
    const deletionRef = this.firestore.collection('compatibilityDeletionRequests').doc(identityHash);
    const requestedAtMs = this.now();
    const receipt = await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(deletionRef);
      if (snapshot.exists) {
        return {
          receiptId: snapshot.get('receiptId') as string,
          requestedAtMs: (snapshot.get('requestedAt') as Timestamp).toMillis(),
        };
      }

      const value = { receiptId: randomUUID(), requestedAtMs };
      transaction.create(deletionRef, {
        uid,
        identityHash,
        receiptId: value.receiptId,
        status: 'pending',
        requestedAt: Timestamp.fromMillis(requestedAtMs),
        deleteAfter: Timestamp.fromMillis(requestedAtMs + AUTH_DELETION_DELAY_MS),
      });
      return value;
    });

    await this.deleteResponses(identityHash, uid);
    await this.deleteRateLimits(uid);
    await deletionRef.update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    });
    return receipt;
  }

  private async deleteResponses(identityHash: string, uid: string): Promise<void> {
    while (true) {
      const snapshot = await this.firestore
        .collectionGroup('responses')
        .where('identityHash', '==', identityHash)
        .limit(100)
        .get();
      if (snapshot.empty) return;

      for (const responseSnapshot of snapshot.docs) {
        const pollRef = responseSnapshot.ref.parent.parent;
        if (!pollRef) throw new Error('invalid_response_path');
        const shardRef = pollRef.collection('shards').doc(String(shardForUid(uid)).padStart(2, '0'));

        await this.firestore.runTransaction(async (transaction) => {
          const [currentResponse, shardSnapshot] = await Promise.all([
            transaction.get(responseSnapshot.ref),
            transaction.get(shardRef),
          ]);
          if (!currentResponse.exists) return;
          const choice = voteChoiceSchema.parse(currentResponse.get('choice'));
          const choiceCount = Number(shardSnapshot.get(choice) ?? 0);
          const total = Number(shardSnapshot.get('total') ?? 0);
          if (!shardSnapshot.exists || choiceCount < 1 || total < 1) {
            throw new Error('aggregate_corrupt');
          }
          transaction.update(shardRef, {
            [choice]: choiceCount - 1,
            total: total - 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.delete(currentResponse.ref);
        });
      }
    }
  }

  private async deleteRateLimits(uid: string): Promise<void> {
    const batch = this.firestore.batch();
    for (let daysAgo = 0; daysAgo < 4; daysAgo += 1) {
      const rateLimit = dailyRateLimit(uid, this.now() - daysAgo * 24 * 60 * 60 * 1000);
      batch.delete(this.firestore.collection('compatibilityRateLimits').doc(rateLimit.id));
    }
    await batch.commit();
  }
}

function pollWindowFromSnapshot(snapshot: FirebaseFirestore.DocumentSnapshot): PollWindow | null {
  const data = snapshot.data();
  if (!data) return null;
  if (typeof data.providerEventId !== 'string' || data.providerEventId.length === 0) {
    throw new Error('invalid_poll_window');
  }
  const providerEventId = data.providerEventId;
  const matchId = matchIdSchema.parse(typeof data.matchId === 'string'
    ? data.matchId
    : matchIdForProvider('espn', providerEventId));
  if (matchId !== matchIdForProvider('espn', providerEventId)) {
    throw new Error('invalid_poll_window');
  }
  const canonicalPollId = pollIdSchema.parse(typeof data.canonicalPollId === 'string'
    ? data.canonicalPollId
    : confidencePollIdForMatch(matchId));
  if (canonicalPollId !== confidencePollIdForMatch(matchId)) {
    throw new Error('invalid_poll_window');
  }
  if (!(data.opensAt instanceof Timestamp) || !(data.closesAt instanceof Timestamp)) {
    throw new Error('invalid_poll_window');
  }
  return {
    pollId: snapshot.id,
    canonicalPollId,
    matchId,
    teamId: teamIdSchema.parse(data.teamId ?? 'timbers'),
    matchTimestamp: matchTimestampSchema.parse(data.matchTimestamp),
    matchStatus: matchStatusSchema.parse(data.matchStatus ?? 'scheduled'),
    providerEventId,
    opensAtMs: data.opensAt.toMillis(),
    closesAtMs: data.closesAt.toMillis(),
  };
}
