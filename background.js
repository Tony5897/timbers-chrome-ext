if (typeof importScripts === 'function') importScripts('runtime-config.js');

const TEAM_SOURCES = {
  timbers: { id: '9723', schedules: [['usa.1', 'mls'], ['concacaf.leagues.cup', 'leagues-cup']], clubUrl: 'https://www.timbers.com', scheduleUrl: 'https://www.timbers.com/schedule/' },
  thorns: { id: '15362', schedules: [['usa.nwsl', 'nwsl']], clubUrl: 'https://www.thorns.com', scheduleUrl: 'https://www.thorns.com/schedule' },
};
const teamSource = (teamId) => TEAM_SOURCES[teamId] || TEAM_SOURCES.timbers;

async function fetchApi(path, options = {}) {
  const baseUrl = globalThis.MATCHDAY_RUNTIME_CONFIG?.apiBaseUrl;
  if (!baseUrl) throw new Error('api_not_configured');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal, headers: { accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`api_http_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function canonicalMatchToPopup(match) {
  const kickoffMs = Date.parse(match.kickoff);
  const dateValue = new Date(kickoffMs);
  const date = dateValue.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' });
  const time = `${dateValue.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PT`;
  return {
    teamId: match.teamId,
    providerEventId: match.providerEventId,
    opponent: match.opponent,
    date,
    time,
    location: match.venue || 'TBA',
    venue: match.venue || 'TBA',
    tv: match.broadcasts?.join(', ') || 'Check Local Listings',
    broadcasts: match.broadcasts || [],
    matchTimestamp: kickoffMs,
    homeAway: match.homeAway === 'home' ? 'home' : 'away',
    competition: match.competitionId,
    status: match.status,
  };
}

async function fetchAndParseSchedule(teamId = 'timbers') {
  if (!globalThis.MATCHDAY_RUNTIME_CONFIG?.apiBaseUrl) return fetchDirectEspnSchedule(teamId);
  try {
    const payload = await fetchApi(`/v1/matches/next?teamId=${encodeURIComponent(teamId)}`);
    const matchData = { ...canonicalMatchToPopup(payload.match), source: payload.source, freshness: payload.freshness };
    if (payload.match.status === 'live') {
      try { matchData.live = await fetchApi(`/v1/matches/live?teamId=${encodeURIComponent(teamId)}`); } catch (_error) { /* score data is optional */ }
    }
    return matchData;
  } catch (error) {
    if (error instanceof Error && error.message === 'api_http_404') return { noMatch: true };
    return null;
  }
}

// Test-only compatibility path: production and packaged builds always load
// runtime-config.js and therefore use the Matchday API boundary above.
async function fetchDirectEspnSchedule(teamId = 'timbers') {
  const source = teamSource(teamId);
  const season = new Date().getFullYear();
  const urls = source.schedules.map(([league]) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${source.id}/schedule?season=${season}&fixture=true`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const responses = await Promise.all(urls.map((url) => fetch(url, { signal: controller.signal })));
    if (responses.some((response) => !response.ok)) return null;
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (payloads.some((payload) => !Array.isArray(payload.events))) return null;
    const now = Date.now();
    const next = payloads.flatMap((payload) => payload.events).filter((event) => {
      const competition = event.competitions?.[0];
      const kickoff = new Date(event.date).getTime();
      return competition && !competition.status?.type?.completed && kickoff > now;
    }).sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0];
    if (!next) return { noMatch: true };
    const competition = next.competitions[0];
    const competitors = competition.competitors || [];
    const opponent = competitors.find((candidate) => String(candidate.team?.id) !== source.id)?.team?.displayName || 'TBA';
    const kickoff = new Date(next.date);
    return {
      teamId,
      providerEventId: String(next.id || ''),
      opponent,
      date: kickoff.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
      time: `${kickoff.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PT`,
      location: competition.venue?.fullName || 'TBA',
      venue: competition.venue?.fullName || 'TBA',
      tv: (competition.broadcasts || []).flatMap((broadcast) => broadcast.names || []).join(', ') || 'Check Local Listings',
      matchTimestamp: kickoff.getTime(),
      homeAway: competitors.find((candidate) => String(candidate.team?.id) === source.id)?.homeAway || 'away',
      competition: next.season?.displayName || source.schedules[0][1],
    };
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCachedMatchData(teamId = 'timbers') {
  return new Promise((resolve) => {
    chrome.storage.local.get(`latestMatchData_${teamId}`, (result) => {
      resolve(result[`latestMatchData_${teamId}`] || (teamId === 'timbers' ? result.latestMatchData || null : null));
    });
  });
}

function getBundledFallback(teamId = 'timbers') {
  if (teamId !== 'timbers') return Promise.resolve(null);
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

async function getMatchDataWithFallback(teamId = 'timbers') {
  const live = await fetchAndParseSchedule(teamId);
  const apiRespondedNoMatch = live && live.noMatch;
  if (live && !live.noMatch) {
    const fallback = await getBundledFallback(teamId);
    const selected = chooseLiveOrFallback(live, fallback);
    if (selected.source === 'live') chrome.storage.local.set({ [`latestMatchData_${teamId}`]: live, ...(teamId === 'timbers' ? { latestMatchData: live } : {}) });
    return selected;
  }

  const cached = await getCachedMatchData(teamId);
  if (cached && cached.matchTimestamp > Date.now()) {
    return { matchData: cached, source: 'cache' };
  }

  const fallback = await getBundledFallback(teamId);
  if (fallback && fallback.matchTimestamp > Date.now()) {
    return { matchData: fallback, source: 'fallback' };
  }

  return { matchData: null, source: apiRespondedNoMatch ? 'no_match' : null };
}

async function fetchStandings(teamId = 'timbers') {
  try { return await fetchApi(`/v1/standings?teamId=${encodeURIComponent(teamId)}`); } catch (_error) { return null; }
}

async function refreshNotifications() {
  const enabled = await new Promise((resolve) => chrome.storage.local.get('notificationsEnabled', (result) => resolve(Boolean(result.notificationsEnabled))));
  if (!enabled) return;
  for (const teamId of Object.keys(TEAM_SOURCES)) {
    const result = await getMatchDataWithFallback(teamId);
    if (!result.matchData) continue;
    const match = result.matchData;
    const reminderKey = kickoffReminderKey(teamId, match.matchTimestamp);
    if (match.matchTimestamp - Date.now() <= 60 * 60 * 1000 && match.matchTimestamp > Date.now() && !(await storageHas(reminderKey))) {
      showNotification('Kickoff reminder', `${match.opponent} starts within one hour.`); chrome.storage.local.set({ [reminderKey]: true });
    }
    await refreshLiveScore(teamId, match);
  }
}
async function refreshLiveScore(teamId, match) {
  if (!match.providerEventId || match.matchTimestamp > Date.now() + 3 * 60 * 60 * 1000 || match.matchTimestamp < Date.now() - 4 * 60 * 60 * 1000) return;
  try {
    const payload = await fetchApi(`/v1/matches/live?teamId=${encodeURIComponent(teamId)}`);
    const scores = [Number(payload.homeScore || 0), Number(payload.awayScore || 0)];
    const scoreKey = `live_score_${teamId}_${match.providerEventId}`;
    const previous = await new Promise((resolve) => chrome.storage.local.get(scoreKey, (result) => resolve(result[scoreKey])));
    chrome.storage.local.set({ [scoreKey]: scores });
    if (!scoreIncreased(previous, scores)) return;
    const eventKey = goalNotificationKey(teamId, match.providerEventId, scores);
    if (await storageHas(eventKey)) return;
    showNotification('Goal update', `${match.teamId === 'thorns' ? 'Thorns' : 'Timbers'} ${scores[0]}–${scores[1]} ${match.opponent || 'opponent'}`);
    chrome.storage.local.set({ [eventKey]: true });
  } catch (_error) { /* provider failure is non-blocking */ }
}
function storageHas(key) { return new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(Boolean(result[key])))); }
function showNotification(title, message) { if (chrome.notifications) chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-128.png', title, message }); }
function kickoffReminderKey(teamId, matchTimestamp) { return `notified_kickoff_${teamId}_${matchTimestamp}`; }
function goalNotificationKey(teamId, providerEventId, scores) { return `notified_goal_${teamId}_${providerEventId}_${scores.join('-')}`; }
function scoreIncreased(previous, next) {
  return Array.isArray(next) && next.length === 2 && (!Array.isArray(previous)
    || next.some((score, index) => Number(score) > Number(previous[index] || 0)));
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
      getMatchDataWithFallback(request.teamId || 'timbers')
        .then((result) => sendResponse(result))
        .catch(() => sendResponse({ matchData: null, source: null }));
      return true;
    }
    if (request.action === 'getStandings') {
      fetchStandings(request.teamId || 'timbers').then((result) => sendResponse(result || { standings: null })).catch(() => sendResponse({ standings: null }));
      return true;
    }
    if (request.action === 'setNotifications') {
      chrome.storage.local.set({ notificationsEnabled: Boolean(request.enabled) });
      sendResponse({ ok: true });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.get('fetchDataAlarm', (existing) => {
    if (!existing) chrome.alarms.create('fetchDataAlarm', { periodInMinutes: 60 });
    chrome.alarms.get('notificationAlarm', (notificationAlarm) => { if (!notificationAlarm) chrome.alarms.create('notificationAlarm', { periodInMinutes: 1 }); });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'fetchDataAlarm') {
      Promise.all(Object.keys(TEAM_SOURCES).map((teamId) => fetchAndParseSchedule(teamId).then((matchData) => {
        if (matchData && !matchData.noMatch) chrome.storage.local.set({ [`latestMatchData_${teamId}`]: matchData, ...(teamId === 'timbers' ? { latestMatchData: matchData } : {}) });
      })));
    }
    if (alarm.name === 'notificationAlarm') refreshNotifications();
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
    kickoffReminderKey,
    goalNotificationKey,
    scoreIncreased,
    fetchAndParseSchedule,
    getMatchDataWithFallback,
    getBundledFallback,
  };
}
