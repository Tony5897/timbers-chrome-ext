// Community vote aggregation via Firebase Firestore REST API.
// Firebase API keys for client-side access are intentionally public — security
// comes from Firestore security rules, not key secrecy (same model as GA4 keys).
//
// Setup:
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. Enable Firestore Database (start in production mode)
//   3. Deploy the rules:  firebase deploy --only firestore:rules
//      (rules file: firestore.rules in this repo)
//   4. Replace the placeholder values below with your project config
//      (Project Settings → General → Your apps → Web app → SDK setup and config)

const COMMUNITY_CONFIG = {
  projectId: 'timbers-matchday',
  apiKey:    'AIzaSyAncw7DRTPa_Ff8pM_5h7Dhqijqiu6Yo40',
};

const _fsProject = COMMUNITY_CONFIG.projectId;
const _fsKey     = COMMUNITY_CONFIG.apiKey;
const _fsBase    = `https://firestore.googleapis.com/v1/projects/${_fsProject}/databases/(default)/documents`;
const _fsEnabled = _fsProject !== 'YOUR_FIREBASE_PROJECT_ID';
const _timeout   = 4000;

globalThis.CommunityVotes = {
  // Returns {high, medium, low} counts from Firestore, or null on error/disabled.
  async get(matchTimestamp) {
    if (!_fsEnabled) return null;
    try {
      const res = await fetch(
        `${_fsBase}/votes/${matchTimestamp}?key=${_fsKey}`,
        { signal: AbortSignal.timeout(_timeout) }
      );
      if (res.status === 404) return { high: 0, medium: 0, low: 0 };
      if (!res.ok) return null;
      const doc = await res.json();
      const f = doc.fields || {};
      return {
        high:   Number(f.high?.integerValue   ?? 0),
        medium: Number(f.medium?.integerValue ?? 0),
        low:    Number(f.low?.integerValue    ?? 0),
      };
    } catch {
      return null;
    }
  },

  // Atomically increments one vote field in Firestore. Silent on failure —
  // the local vote is already saved before this is called.
  async increment(matchTimestamp, vote) {
    if (!_fsEnabled) return;
    const docPath = `projects/${_fsProject}/databases/(default)/documents/votes/${matchTimestamp}`;
    try {
      await fetch(
        `https://firestore.googleapis.com/v1/projects/${_fsProject}/databases/(default)/documents:commit?key=${_fsKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            writes: [{
              transform: {
                document: docPath,
                fieldTransforms: [{ fieldPath: vote, increment: { integerValue: '1' } }],
              },
            }],
          }),
          signal: AbortSignal.timeout(_timeout),
        }
      );
    } catch {
      // Silent fail — local vote is already saved; community sync is best-effort.
    }
  },
};
