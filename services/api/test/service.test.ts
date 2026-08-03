import { describe, expect, it, vi } from 'vitest';
import type { Aggregate, PollWindow } from '../src/domain.js';
import type {
  CompatibilityRepository,
  SubmissionResult,
} from '../src/repository.js';
import { CompatibilityPollService } from '../src/service.js';

const matchTimestamp = 1786156200000;
const pollWindow: PollWindow = {
  pollId: 'legacy-1786156200000-confidence-v1',
  canonicalPollId: 'poll-espn-401999001-confidence-v1',
  matchId: 'espn-401999001',
  teamId: 'timbers',
  matchTimestamp,
  matchStatus: 'scheduled',
  providerEventId: '401999001',
  opensAtMs: matchTimestamp - (72 * 60 * 60 * 1000),
  closesAtMs: matchTimestamp,
};
const aggregate: Aggregate = { high: 2, medium: 1, low: 0, total: 3 };

function repository(overrides: Partial<CompatibilityRepository> = {}): CompatibilityRepository {
  return {
    getPollWindow: vi.fn(async () => pollWindow),
    getPollWindowByCanonicalId: vi.fn(async () => pollWindow),
    upsertPollWindows: vi.fn(async () => undefined),
    submitResponse: vi.fn(async (): Promise<SubmissionResult> => ({ status: 'accepted', choice: 'high' })),
    getAggregate: vi.fn(async () => aggregate),
    requestInstallationDeletion: vi.fn(async () => ({
      receiptId: 'deletion-receipt',
      requestedAtMs: matchTimestamp,
    })),
    ...overrides,
  };
}

describe('CompatibilityPollService', () => {
  it('accepts a response inside the provider-backed poll window', async () => {
    const data = repository();
    const service = new CompatibilityPollService(data, vi.fn(), () => matchTimestamp - 1_000);

    const result = await service.submit({
      matchTimestamp,
      uid: 'anonymous-user',
      choice: 'high',
      clientVersion: '1.0.5',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result).toEqual({ status: 'accepted', choice: 'high', aggregate });
    expect(data.submitResponse).toHaveBeenCalledOnce();
    expect(data.submitResponse).toHaveBeenCalledWith(expect.objectContaining({
      matchTimestamp,
    }));
  });

  it('rejects an outdated client before writing', async () => {
    const data = repository();
    const service = new CompatibilityPollService(data, vi.fn(), () => matchTimestamp - 1_000);

    await expect(service.submit({
      matchTimestamp,
      uid: 'anonymous-user',
      choice: 'high',
      clientVersion: '1.0.4',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    })).rejects.toThrow('unsupported_client');
    expect(data.submitResponse).not.toHaveBeenCalled();
  });

  it('rejects submissions before open and at close', async () => {
    const beforeOpen = new CompatibilityPollService(repository(), vi.fn(), () => pollWindow.opensAtMs - 1);
    const atClose = new CompatibilityPollService(repository(), vi.fn(), () => pollWindow.closesAtMs);
    const input = {
      matchTimestamp,
      uid: 'anonymous-user',
      choice: 'medium' as const,
      clientVersion: '1.0.5',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    };

    await expect(beforeOpen.submit(input)).rejects.toThrow('poll_not_open');
    await expect(atClose.submit(input)).rejects.toThrow('poll_closed');
  });

  it('refreshes provider windows when the requested poll is missing', async () => {
    let lookupCount = 0;
    const data = repository({
      getPollWindow: vi.fn(async () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : pollWindow;
      }),
    });
    const fetchWindows = vi.fn(async () => [pollWindow]);
    const service = new CompatibilityPollService(data, fetchWindows, () => matchTimestamp - 1_000);

    await service.getAggregate(matchTimestamp);

    expect(fetchWindows).toHaveBeenCalledOnce();
    expect(data.upsertPollWindows).toHaveBeenCalledWith([pollWindow]);
  });

  it('maps a nearby legacy timestamp to the canonical provider window', async () => {
    const data = repository();
    const service = new CompatibilityPollService(data);

    const result = await service.getAggregateResult(matchTimestamp + 30 * 60 * 1000);

    expect(data.getAggregate).toHaveBeenCalledWith(matchTimestamp);
    expect(result).toEqual({
      aggregate,
      pollId: pollWindow.pollId,
      matchTimestamp,
    });
  });

  it('resolves a canonical poll ID without exposing the timestamp storage key', async () => {
    const data = repository();
    const service = new CompatibilityPollService(data);

    const result = await service.getCanonicalAggregateResult(pollWindow.canonicalPollId);

    expect(data.getPollWindowByCanonicalId).toHaveBeenCalledWith(pollWindow.canonicalPollId);
    expect(data.getAggregate).toHaveBeenCalledWith(matchTimestamp);
    expect(result).toEqual({ aggregate, window: pollWindow });
  });

  it('refreshes compatibility windows before rejecting an unknown canonical poll', async () => {
    const getPollWindowByCanonicalId = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pollWindow);
    const data = repository({ getPollWindowByCanonicalId });
    const fetchWindows = vi.fn(async () => [pollWindow]);
    const service = new CompatibilityPollService(data, fetchWindows);

    await expect(service.getCanonicalAggregateResult(pollWindow.canonicalPollId)).resolves.toEqual({
      aggregate,
      window: pollWindow,
    });
    expect(fetchWindows).toHaveBeenCalledOnce();
    expect(data.upsertPollWindows).toHaveBeenCalledWith([pollWindow]);
  });

  it('rejects timestamps absent from a refreshed provider schedule', async () => {
    const data = repository({ getPollWindow: vi.fn(async () => null) });
    const service = new CompatibilityPollService(data, vi.fn(async () => []));

    await expect(service.getAggregate(matchTimestamp)).rejects.toThrow('poll_not_found');
  });

  it('delegates authenticated installation deletion to the repository', async () => {
    const data = repository();
    const service = new CompatibilityPollService(data);

    await expect(service.deleteInstallation('anonymous-user')).resolves.toEqual({
      receiptId: 'deletion-receipt',
      requestedAtMs: matchTimestamp,
    });
    expect(data.requestInstallationDeletion).toHaveBeenCalledWith('anonymous-user');
  });
});
