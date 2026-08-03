import { describe, expect, it } from 'vitest';
import {
  dailyRateLimit,
  hashIdentity,
  MINIMUM_CLIENT_VERSION,
  isSupportedClientVersion,
  isValidIdempotencyKey,
  pollIdForTimestamp,
  shardForUid,
} from '../src/domain.js';

describe('compatibility domain', () => {
  it('creates a stable legacy poll ID', () => {
    expect(pollIdForTimestamp(1786156200000)).toBe('legacy-1786156200000-confidence-v1');
  });

  it('maps the same UID to the same bounded shard', () => {
    const first = shardForUid('anonymous-installation-a');
    expect(shardForUid('anonymous-installation-a')).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(32);
  });

  it.each([
    [MINIMUM_CLIENT_VERSION, true],
    ['1.0.6', true],
    ['1.1.0', true],
    ['2.0.0', true],
    ['1.0.4', false],
    ['0.99.99', false],
    ['1.0', false],
    ['not-a-version', false],
  ])('evaluates client version %s', (version, expected) => {
    expect(isSupportedClientVersion(version)).toBe(expected);
  });

  it.each([
    ['550e8400-e29b-41d4-a716-446655440000', true],
    ['A_secure-idempotency_key_1234', true],
    ['short', false],
    ['contains spaces and punctuation!', false],
  ])('validates idempotency key %s', (key, expected) => {
    expect(isValidIdempotencyKey(key)).toBe(expected);
  });

  it('creates a pseudonymous UTC-day rate-limit key with bounded retention', () => {
    const first = dailyRateLimit('anonymous-installation-a', Date.parse('2026-08-03T12:00:00Z'));
    const sameDay = dailyRateLimit('anonymous-installation-a', Date.parse('2026-08-03T23:59:59Z'));
    const nextDay = dailyRateLimit('anonymous-installation-a', Date.parse('2026-08-04T00:00:00Z'));

    expect(first.id).toMatch(/^[a-f0-9]{64}$/);
    expect(sameDay.id).toBe(first.id);
    expect(nextDay.id).not.toBe(first.id);
    expect(first.expiresAtMs).toBe(Date.parse('2026-08-05T00:00:00Z'));
  });

  it('creates a stable one-way identity lookup key', () => {
    expect(hashIdentity('anonymous-installation-a')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIdentity('anonymous-installation-a')).toBe(hashIdentity('anonymous-installation-a'));
    expect(hashIdentity('anonymous-installation-a')).not.toBe(hashIdentity('anonymous-installation-b'));
  });
});
