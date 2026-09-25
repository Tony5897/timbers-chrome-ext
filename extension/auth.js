(function () {
  const STORAGE_KEY = '_matchday_auth_v1';
  const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 6_000;

  function config() {
    const value = globalThis.MATCHDAY_RUNTIME_CONFIG;
    if (!value?.apiKey || !value?.projectId) throw new Error('auth_not_configured');
    return value;
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error('auth_storage_read_failed'));
          return;
        }
        resolve(result[key] ?? null);
      });
    });
  }

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error('auth_storage_write_failed'));
          return;
        }
        resolve();
      });
    });
  }

  function storageRemove() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, resolve);
    });
  }

  async function timedFetch(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  function sessionFromResponse(response) {
    const expiresInSeconds = Number(response.expiresIn ?? response.expires_in);
    const idToken = response.idToken ?? response.access_token;
    const refreshToken = response.refreshToken ?? response.refresh_token;
    const localId = response.localId ?? response.user_id;
    if (!idToken || !refreshToken || !localId || !Number.isFinite(expiresInSeconds)) {
      throw new Error('invalid_auth_response');
    }
    return {
      idToken,
      refreshToken,
      localId,
      expiresAt: Date.now() + (expiresInSeconds * 1000),
    };
  }

  async function createAnonymousSession() {
    const currentConfig = config();
    const response = await timedFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(currentConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      },
    );
    if (!response.ok) throw new Error('anonymous_auth_failed');
    const session = sessionFromResponse(await response.json());
    await storageSet(session);
    return session;
  }

  async function refreshSession(session) {
    const currentConfig = config();
    const response = await timedFetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(currentConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        }).toString(),
      },
    );
    if (!response.ok) {
      await storageRemove();
      throw new Error('auth_refresh_failed');
    }
    const refreshed = sessionFromResponse(await response.json());
    await storageSet(refreshed);
    return refreshed;
  }

  async function getIdToken(forceRefresh = false) {
    let session = await storageGet(STORAGE_KEY);
    if (!session) session = await createAnonymousSession();
    if (forceRefresh || session.expiresAt <= Date.now() + EXPIRY_BUFFER_MS) {
      session = await refreshSession(session);
    }
    return session.idToken;
  }

  async function hasSession() {
    return Boolean(await storageGet(STORAGE_KEY));
  }

  const matchdayAuth = {
    getIdToken,
    hasSession,
    clearSession: storageRemove,
  };

  globalThis.MatchdayAuth = matchdayAuth;
  if (typeof module !== 'undefined' && module.exports) module.exports = matchdayAuth;
})();
