// Season year is computed at service-worker startup so it automatically
// advances each calendar year without any manual updates.
const ESPN_SCHEDULE_URLS = [
  `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/9723/schedule?season=${new Date().getFullYear()}&fixture=true`,
  `https://site.api.espn.com/apis/site/v2/sports/soccer/concacaf.leagues.cup/teams/9723/schedule?season=${new Date().getFullYear()}&fixture=true`,
];
const TIMBERS_ESPN_ID = '9723';

async function fetchAndParseSchedule() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const responses = await Promise.all(
      ESPN_SCHEDULE_URLS.map((url) => fetch(url, { signal: controller.signal })),
    );
    if (responses.some((response) => !response.ok)) return null;
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (payloads.some((payload) => !Array.isArray(payload.events))) return null;

    const now = Date.now();
    const events = payloads.flatMap((payload) => payload.events);
    const next = events
      .filter((event) => {
        const competition = event.competitions && event.competitions[0];
        return competition &&
          !competition.status?.type?.completed &&
          new Date(event.date).getTime() > now;
      })
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0];
    if (!next) return { noMatch: true };

    const comp = next.competitions[0];
    const competitors = comp.competitors || [];
    const opponentTeam = competitors.find((c) => c.team.id !== TIMBERS_ESPN_ID);
    const opponent = opponentTeam?.team?.displayName || 'TBA';

    const matchTimestamp = new Date(next.date).getTime();
    const matchDate = new Date(matchTimestamp);

    const date = matchDate.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }).replace(/\//g, '-');

    const time =
      matchDate.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' PT';

    const location = comp.venue?.fullName || 'TBA';
    const broadcasts = comp.broadcasts || [];
    const tv = broadcasts.flatMap((b) => b.names || []).join(', ') || 'Check Local Listings';

    return { opponent, date, time, location, tv, matchTimestamp };
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCachedMatchData() {
  return new Promise((resolve) => {
    chrome.storage.local.get('latestMatchData', (result) => {
      resolve(result.latestMatchData || null);
    });
  });
}

function getBundledFallback() {
  return fetch(chrome.runtime.getURL('data/fallback.json'))
    .then((res) => res.json())
    .then((data) => {
      // Support full-season schedule array: pick the first fixture still in the future.
      // Also supports legacy single-object format for backwards compatibility.
      if (Array.isArray(data)) {
        const now = Date.now();
        return data.find((m) => m.matchTimestamp > now) || null;
      }
      return data;
    })
    .catch(() => null);
}

async function getMatchDataWithFallback() {
  const live = await fetchAndParseSchedule();
  const apiRespondedNoMatch = live && live.noMatch;
  if (live && !live.noMatch) {
    const fallback = await getBundledFallback();
    const selected = chooseLiveOrFallback(live, fallback);
    if (selected.source === 'live') chrome.storage.local.set({ latestMatchData: live });
    return selected;
  }

  const cached = await getCachedMatchData();
  if (cached && cached.matchTimestamp > Date.now()) {
    return { matchData: cached, source: 'cache' };
  }

  const fallback = await getBundledFallback();
  if (fallback && fallback.matchTimestamp > Date.now()) {
    return { matchData: fallback, source: 'fallback' };
  }

  return { matchData: null, source: apiRespondedNoMatch ? 'no_match' : null };
}

function chooseLiveOrFallback(live, fallback) {
  if (!fallback || fallback.matchTimestamp <= Date.now()) {
    return { matchData: live, source: 'live' };
  }

  const sameOpponent = normalizeOpponent(live.opponent) === normalizeOpponent(fallback.opponent);
  const kickoffDifference = Math.abs(live.matchTimestamp - fallback.matchTimestamp);
  if (sameOpponent && kickoffDifference <= 24 * 60 * 60 * 1000) {
    if (kickoffDifference > 5 * 60 * 1000) return { matchData: fallback, source: 'fallback' };
    return { matchData: live, source: 'live' };
  }

  return fallback.matchTimestamp < live.matchTimestamp
    ? { matchData: fallback, source: 'fallback' }
    : { matchData: live, source: 'live' };
}

function normalizeOpponent(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getMatchData') {
      getMatchDataWithFallback()
        .then((result) => sendResponse(result))
        .catch(() => sendResponse({ matchData: null, source: null }));
      return true;
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.get('fetchDataAlarm', (existing) => {
    if (!existing) chrome.alarms.create('fetchDataAlarm', { periodInMinutes: 60 });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'fetchDataAlarm') {
      fetchAndParseSchedule().then((matchData) => {
        if (matchData && !matchData.noMatch) {
          chrome.storage.local.set({ latestMatchData: matchData });
        }
      });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    // Warm the cache immediately on install.  getMatchDataWithFallback()
    // already writes live data to storage internally (see line ~87), so no
    // extra write is needed here — promoting fallback/cache data back into
    // latestMatchData would make stale data indistinguishable from live data.
    getMatchDataWithFallback();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chooseLiveOrFallback,
    fetchAndParseSchedule,
    getMatchDataWithFallback,
    getBundledFallback,
  };
}
