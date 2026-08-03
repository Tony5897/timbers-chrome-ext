import { createHash } from 'node:crypto';
import {
  compatibilityResponseBodySchema,
  voteChoiceSchema,
  type Aggregate,
  type CanonicalMatch,
  type TeamId,
  type VoteChoice,
} from '@matchday/contracts';
import { POLL_OPEN_LEAD_MS } from '@matchday/domain';
import { z } from 'zod';

export const TEAM_ID = 'timbers';
export const POLL_TYPE = 'confidence';
export const POLL_VERSION = 1;
export const SHARD_COUNT = 32;
export const MINIMUM_CLIENT_VERSION = '1.0.5';
export const RAW_RESPONSE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const DAILY_RESPONSE_LIMIT = 10;
export const RATE_LIMIT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
export const AUTH_DELETION_DELAY_MS = 60 * 60 * 1000;
export const LEGACY_TIMESTAMP_TOLERANCE_MS = 60 * 60 * 1000;

export { voteChoiceSchema };
export type { Aggregate, VoteChoice };

export const responseBodySchema = compatibilityResponseBodySchema;

export const matchTimestampSchema = z.coerce.number().int().min(1_600_000_000_000).max(4_102_444_800_000);

export type PollWindow = {
  pollId: string;
  canonicalPollId: string;
  matchId: string;
  teamId: TeamId;
  matchTimestamp: number;
  matchStatus: CanonicalMatch['status'];
  providerEventId: string;
  opensAtMs: number;
  closesAtMs: number;
};

export { POLL_OPEN_LEAD_MS };

export function pollIdForTimestamp(matchTimestamp: number): string {
  return `legacy-${matchTimestamp}-${POLL_TYPE}-v${POLL_VERSION}`;
}

export function shardForUid(uid: string): number {
  const digest = createHash('sha256').update(uid).digest();
  return digest.readUInt32BE(0) % SHARD_COUNT;
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function hashIdentity(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

export function dailyRateLimit(uid: string, nowMs: number): { id: string; expiresAtMs: number } {
  const date = new Date(nowMs).toISOString().slice(0, 10);
  return {
    id: createHash('sha256').update(`${uid}:${date}`).digest('hex'),
    expiresAtMs: Date.parse(`${date}T00:00:00.000Z`) + RATE_LIMIT_RETENTION_MS,
  };
}

export function isSupportedClientVersion(version: string): boolean {
  const parse = (value: string): [number, number, number] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const actual = parse(version);
  const minimum = parse(MINIMUM_CLIENT_VERSION);
  if (!actual || !minimum) return false;

  for (let index = 0; index < actual.length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }
  return true;
}

export function isValidIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function emptyAggregate(): Aggregate {
  return { high: 0, medium: 0, low: 0, total: 0 };
}
