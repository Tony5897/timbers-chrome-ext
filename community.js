(function () {
  const REQUEST_TIMEOUT_MS = 6_000;
  const PENDING_PREFIX = '_matchday_pending_vote_';

  function config() {
    const value = globalThis.MATCHDAY_RUNTIME_CONFIG;
    if (!value?.apiBaseUrl || !value?.clientVersion) throw new Error('community_not_configured');
    return value;
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error('community_storage_read_failed'));
          return;
        }
        resolve(result[key] ?? null);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error('community_storage_write_failed'));
          return;
        }
        resolve();
      });
    });
  }

  function storageGetAll() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error('community_storage_read_failed'));
          return;
        }
        resolve(result);
      });
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => chrome.storage.local.remove(key, resolve));
  }

  function pendingKey(matchTimestamp) {
    return `${PENDING_PREFIX}${matchTimestamp}`;
  }

  function createIdempotencyKey() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function apiFetch(path, options = {}) {
    const currentConfig = config();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${currentConfig.apiBaseUrl}${path}`, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function aggregateFromPayload(payload) {
    const choices = payload?.choices;
    if (!choices) return null;
    return {
      high: Number(choices.high ?? 0),
      medium: Number(choices.medium ?? 0),
      low: Number(choices.low ?? 0),
    };
  }

  async function submitPending(pending, forceRefresh = false) {
    const currentConfig = config();
    const idToken = await globalThis.MatchdayAuth.getIdToken(forceRefresh);
    const response = await apiFetch(
      `/v1/legacy-polls/${pending.matchTimestamp}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'X-Client-Version': currentConfig.clientVersion,
          'X-Idempotency-Key': pending.idempotencyKey,
        },
        body: JSON.stringify({ choice: pending.choice }),
      },
    );

    if (response.status === 401 && !forceRefresh) return submitPending(pending, true);
    if (!response.ok) throw new Error(`community_submit_${response.status}`);

    const payload = await response.json();
    await storageRemove(pendingKey(pending.matchTimestamp));
    return aggregateFromPayload(payload);
  }

  async function get(matchTimestamp) {
    try {
      const pending = await storageGet(pendingKey(matchTimestamp));
      if (pending) {
        try {
          const submittedAggregate = await submitPending(pending);
          if (submittedAggregate) return submittedAggregate;
        } catch {}
      }

      const response = await apiFetch(`/v1/legacy-polls/${matchTimestamp}/aggregate`);
      if (!response.ok) return null;
      return aggregateFromPayload(await response.json());
    } catch {
      return null;
    }
  }

  async function increment(matchTimestamp, choice) {
    const key = pendingKey(matchTimestamp);
    try {
      let pending = await storageGet(key);
      if (!pending) {
        pending = {
          matchTimestamp,
          choice,
          idempotencyKey: createIdempotencyKey(),
          createdAt: Date.now(),
        };
        await storageSet(key, pending);
      }
      const aggregate = await submitPending(pending);
      return { synced: true, aggregate };
    } catch {
      return { synced: false, aggregate: null };
    }
  }

  async function clearCommunityState() {
    const values = await storageGetAll();
    const keys = Object.keys(values).filter((key) => (
      key.startsWith(PENDING_PREFIX) || key.startsWith('hasVoted_') || key.startsWith('votes_')
    ));
    if (keys.length > 0) await storageRemove(keys);
  }

  async function deleteInstallation(forceRefresh = false) {
    try {
      const idToken = await globalThis.MatchdayAuth.getIdToken(forceRefresh);
      const response = await apiFetch('/v1/installations/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (response.status === 401 && !forceRefresh) return deleteInstallation(true);
      if (!response.ok) throw new Error(`community_delete_${response.status}`);
      const receipt = await response.json();
      await globalThis.MatchdayAuth.clearSession();
      await clearCommunityState();
      return { deleted: true, receiptId: receipt.receiptId ?? null };
    } catch {
      return { deleted: false, receiptId: null };
    }
  }

  const communityVotes = { get, increment, deleteInstallation };
  globalThis.CommunityVotes = communityVotes;
  if (typeof module !== 'undefined' && module.exports) module.exports = communityVotes;
})();
