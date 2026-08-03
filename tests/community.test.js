function createChromeStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: {
          get(key, callback) {
            callback(key === null ? { ...values } : { [key]: values[key] });
          },
          set(update, callback) {
            Object.assign(values, update);
            callback();
          },
          remove(key, callback) {
            for (const item of Array.isArray(key) ? key : [key]) delete values[item];
            callback();
          },
        },
      },
    },
  };
}

const matchTimestamp = 1786156200000;

describe('CommunityVotes compatibility client', () => {
  beforeEach(() => {
    jest.resetModules();
    global.MATCHDAY_RUNTIME_CONFIG = {
      apiBaseUrl: 'https://api.example.test',
      clientVersion: '1.0.5',
    };
    global.MatchdayAuth = {
      getIdToken: jest.fn().mockResolvedValue('id-token'),
      clearSession: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
    delete global.CommunityVotes;
    delete global.MatchdayAuth;
    delete global.MATCHDAY_RUNTIME_CONFIG;
  });

  test('reads only aggregate choice counts from the API', async () => {
    const storage = createChromeStorage();
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: { high: 4, medium: 2, low: 1, total: 7 } }),
    });
    const community = require('../community');

    await expect(community.get(matchTimestamp)).resolves.toEqual({ high: 4, medium: 2, low: 1 });
    expect(global.MatchdayAuth.getIdToken).not.toHaveBeenCalled();
  });

  test('persists a pending response when submission fails', async () => {
    const storage = createChromeStorage();
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const community = require('../community');

    await expect(community.increment(matchTimestamp, 'high')).resolves.toEqual({
      synced: false,
      aggregate: null,
    });
    expect(storage.values[`_matchday_pending_vote_${matchTimestamp}`]).toEqual(expect.objectContaining({
      choice: 'high',
      matchTimestamp,
      idempotencyKey: expect.any(String),
    }));
  });

  test('retries a pending response with the same idempotency key', async () => {
    const pending = {
      choice: 'medium',
      matchTimestamp,
      idempotencyKey: 'stable-idempotency-key-1234',
      createdAt: Date.now(),
    };
    const storage = createChromeStorage({ [`_matchday_pending_vote_${matchTimestamp}`]: pending });
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ choices: { high: 1, medium: 1, low: 0, total: 2 } }),
    });
    const community = require('../community');

    await expect(community.get(matchTimestamp)).resolves.toEqual({ high: 1, medium: 1, low: 0 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Idempotency-Key': pending.idempotencyKey }),
      }),
    );
    expect(storage.values[`_matchday_pending_vote_${matchTimestamp}`]).toBeUndefined();
  });

  test('refreshes authentication and retries once after a 401', async () => {
    const storage = createChromeStorage();
    global.chrome = storage.chrome;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ choices: { high: 0, medium: 0, low: 1, total: 1 } }),
      });
    const community = require('../community');

    await expect(community.increment(matchTimestamp, 'low')).resolves.toEqual({
      synced: true,
      aggregate: { high: 0, medium: 0, low: 1 },
    });
    expect(global.MatchdayAuth.clearSession).not.toHaveBeenCalled();
    expect(global.MatchdayAuth.getIdToken).toHaveBeenCalledTimes(2);
  });

  test('deletes retained community data and clears only community-local state', async () => {
    const storage = createChromeStorage({
      _matchday_auth_v1: { idToken: 'id-token' },
      [`_matchday_pending_vote_${matchTimestamp}`]: { choice: 'high' },
      [`hasVoted_${matchTimestamp}`]: true,
      [`votes_${matchTimestamp}`]: { high: 1, medium: 0, low: 0 },
      latestMatchData: { opponent: 'Puebla' },
    });
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ status: 'scheduled', receiptId: 'deletion-receipt-001' }),
    });
    const community = require('../community');

    await expect(community.deleteInstallation()).resolves.toEqual({
      deleted: true,
      receiptId: 'deletion-receipt-001',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/installations/me',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(global.MatchdayAuth.clearSession).toHaveBeenCalledTimes(1);
    expect(storage.values[`_matchday_pending_vote_${matchTimestamp}`]).toBeUndefined();
    expect(storage.values[`hasVoted_${matchTimestamp}`]).toBeUndefined();
    expect(storage.values[`votes_${matchTimestamp}`]).toBeUndefined();
    expect(storage.values.latestMatchData).toEqual({ opponent: 'Puebla' });
  });
});
