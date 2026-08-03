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
            delete values[key];
            callback();
          },
        },
      },
    },
  };
}

describe('MatchdayAuth', () => {
  beforeEach(() => {
    jest.resetModules();
    global.MATCHDAY_RUNTIME_CONFIG = {
      projectId: 'timbers-matchday',
      apiKey: 'public-api-key',
    };
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
    delete global.MatchdayAuth;
    delete global.MATCHDAY_RUNTIME_CONFIG;
  });

  test('creates and persists an anonymous Firebase session', async () => {
    const storage = createChromeStorage();
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        localId: 'anonymous-uid',
        expiresIn: '3600',
      }),
    });
    const auth = require('../auth');

    await expect(auth.getIdToken()).resolves.toBe('id-token');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('accounts:signUp'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(storage.values._matchday_auth_v1).toEqual(expect.objectContaining({
      localId: 'anonymous-uid',
      refreshToken: 'refresh-token',
    }));
  });

  test('reuses a valid stored token without a network request', async () => {
    const storage = createChromeStorage({
      _matchday_auth_v1: {
        idToken: 'stored-token',
        refreshToken: 'refresh-token',
        localId: 'anonymous-uid',
        expiresAt: Date.now() + 20 * 60 * 1000,
      },
    });
    global.chrome = storage.chrome;
    global.fetch = jest.fn();
    const auth = require('../auth');

    await expect(auth.getIdToken()).resolves.toBe('stored-token');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('refreshes an expiring token and persists the replacement', async () => {
    const storage = createChromeStorage({
      _matchday_auth_v1: {
        idToken: 'expired-token',
        refreshToken: 'old-refresh-token',
        localId: 'anonymous-uid',
        expiresAt: Date.now() + 1_000,
      },
    });
    global.chrome = storage.chrome;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-token',
        refresh_token: 'new-refresh-token',
        user_id: 'anonymous-uid',
        expires_in: '3600',
      }),
    });
    const auth = require('../auth');

    await expect(auth.getIdToken()).resolves.toBe('refreshed-token');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('securetoken.googleapis.com'),
      expect.objectContaining({ body: expect.stringContaining('old-refresh-token') }),
    );
    expect(storage.values._matchday_auth_v1.idToken).toBe('refreshed-token');
  });

  test('reports whether an anonymous session already exists without creating one', async () => {
    const storage = createChromeStorage({ _matchday_auth_v1: { idToken: 'stored-token' } });
    global.chrome = storage.chrome;
    global.fetch = jest.fn();
    const auth = require('../auth');

    await expect(auth.hasSession()).resolves.toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
