try { importScripts('telemetry.local.js'); } catch (_e) {}
try { importScripts('telemetry.js'); } catch (_e) {}

// Season year is computed at service-worker startup so it automatically
// advances each calendar year without any manual updates.
const ESPN_SCHEDULE_URL =
  `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/9723/schedule?season=${new Date().getFullYear()}`;
const TIMBERS_ESPN_ID = '9723';

async function fetchAndParseSchedule() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(ESPN_SCHEDULE_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();

    // Guard against malformed payloads — a missing/non-array events field
    // means ESPN changed shape, not that there are legitimately no matches.
    if (!Array.isArray(data.events)) return null;

    const now = Date.now();
    const events = data.events;
    const next = events.find((e) => {
      const comp = e.competitions && e.competitions[0];
      return comp &&
        !comp.status?.type?.completed &&
        new Date(e.date).getTime() > now;
    });
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
    .catch(() => null);
}

async function getMatchDataWithFallback() {
  const fetchStart = Date.now();

  if (typeof Telemetry !== 'undefined') {
    Telemetry.sendEvent('match_fetch_started', { ui_surface: 'background' });
  }

  const live = await fetchAndParseSchedule();
  const apiHealthy = live && live.noMatch;   // ESPN responded but no fixture published yet
  if (live && !live.noMatch) {
    chrome.storage.local.set({ latestMatchData: live });
    if (typeof Telemetry !== 'undefined') {
      Telemetry.sendEvent('match_fetch_live_success', {
        source: 'live',
        has_match_data: true,
        fetch_duration_ms: Date.now() - fetchStart,
        ui_surface: 'background',
      });
    }
    return { matchData: live, source: 'live' };
  }

  const cached = await getCachedMatchData();
  if (cached) {
    if (typeof Telemetry !== 'undefined') {
      Telemetry.sendEvent('match_fetch_cache_used', {
        source: 'cache',
        has_match_data: true,
        ui_surface: 'background',
      });
    }
    return { matchData: cached, source: 'cache' };
  }

  const fallback = await getBundledFallback();
  if (fallback && fallback.matchTimestamp > Date.now()) {
    if (typeof Telemetry !== 'undefined') {
      Telemetry.sendEvent('match_fetch_fallback_used', {
        source: 'fallback',
        has_match_data: true,
        ui_surface: 'background',
      });
    }
    return { matchData: fallback, source: 'fallback' };
  }

  if (typeof Telemetry !== 'undefined') {
    Telemetry.sendEvent('match_fetch_failed', { has_match_data: false, ui_surface: 'background' });
  }
  return { matchData: null, source: apiHealthy ? 'no_match' : null };
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
  chrome.alarms.create('fetchDataAlarm', { periodInMinutes: 60 });
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
  module.exports = { fetchAndParseSchedule, getMatchDataWithFallback };
}
