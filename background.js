// Season year is computed at service-worker startup so it automatically
// advances each calendar year without any manual updates.
const TEAM_SOURCES = {
  timbers: { id: '9723', schedules: [['usa.1', 'mls'], ['concacaf.leagues.cup', 'leagues-cup']], clubUrl: 'https://www.timbers.com', scheduleUrl: 'https://www.timbers.com/schedule/' },
  thorns: { id: '15362', schedules: [['usa.nwsl', 'nwsl']], clubUrl: 'https://www.thorns.com', scheduleUrl: 'https://www.thorns.com/schedule' },
};
const teamSource = (teamId) => TEAM_SOURCES[teamId] || TEAM_SOURCES.timbers;

async function fetchAndParseSchedule(teamId = 'timbers') {
  const source = teamSource(teamId);
  const season = new Date().getFullYear();
  const urls = source.schedules.map(([league, _competition]) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${source.id}/schedule?season=${season}&fixture=true`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const responses = await Promise.all(
      urls.map((url) => fetch(url, { signal: controller.signal })),
    );
    if (responses.some((response) => !response.ok)) return null;
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (payloads.some((payload) => !Array.isArray(payload.events))) return null;

    const now = Date.now();
    const events = payloads.flatMap((payload) => payload.events);
    const next = events
      .filter((event) => {
        const competition = event.competitions && event.competitions[0];
        const kickoff = new Date(event.date).getTime();
        const isLive = competition?.status?.type?.state === 'in';
        return competition && !competition.status?.type?.completed && (kickoff > now || (isLive && kickoff > now - 4 * 60 * 60 * 1000));
      })
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0];
    if (!next) return { noMatch: true };

    const comp = next.competitions[0];
    const competitors = comp.competitors || [];
    const opponentTeam = competitors.find((c) => String(c.team.id) !== source.id);
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

    const homeAway = competitors.find((c) => String(c.team.id) === source.id)?.homeAway || 'away';
    return { teamId, providerEventId: String(next.id || ''), opponent, date, time, location, venue: location, tv, matchTimestamp, homeAway, competition: next.season?.displayName || source.schedules[0][1] };
  } catch (_e) {
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
  const source = teamSource(teamId);
  const league = source.schedules[0][0];
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/standings?season=${new Date().getFullYear()}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const entries = payload?.children?.flatMap((group) => group.standings?.entries || []) || payload?.standings?.entries || [];
    return entries.map((entry, index) => ({ rank: Number(entry.stats?.find((stat) => stat.name === 'rank')?.value || index + 1), club: entry.team?.displayName || 'Club', points: Number(entry.stats?.find((stat) => stat.name === 'points')?.value || entry.stats?.find((stat) => stat.name === 'pointsFor')?.value || 0), highlight: String(entry.team?.id) === source.id })).sort((a, b) => a.rank - b.rank);
  } catch (_error) { return null; }
}

async function refreshNotifications() {
  const enabled = await new Promise((resolve) => chrome.storage.local.get('notificationsEnabled', (result) => resolve(Boolean(result.notificationsEnabled))));
  if (!enabled) return;
  for (const teamId of Object.keys(TEAM_SOURCES)) {
    const result = await getMatchDataWithFallback(teamId);
    if (!result.matchData) continue;
    const match = result.matchData;
    const reminderKey = `notified_kickoff_${teamId}_${match.matchTimestamp}`;
    if (match.matchTimestamp - Date.now() <= 60 * 60 * 1000 && match.matchTimestamp > Date.now() && !(await storageHas(reminderKey))) {
      showNotification('Kickoff reminder', `${match.opponent} starts within one hour.`); chrome.storage.local.set({ [reminderKey]: true });
    }
    await refreshLiveScore(teamId, match);
  }
}
async function refreshLiveScore(teamId, match) {
  if (!match.providerEventId || match.matchTimestamp > Date.now() + 3 * 60 * 60 * 1000 || match.matchTimestamp < Date.now() - 4 * 60 * 60 * 1000) return;
  const source = teamSource(teamId);
  const date = new Date(match.matchTimestamp).toISOString().slice(0, 10).replace(/-/g, '');
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${source.schedules[0][0]}/scoreboard?dates=${date}`);
    if (!response.ok) return;
    const payload = await response.json();
    const event = (payload.events || []).find((candidate) => String(candidate.id) === String(match.providerEventId));
    const competitors = event?.competitions?.[0]?.competitors || [];
    if (competitors.length < 2) return;
    const scores = competitors.map((competitor) => Number(competitor.score || 0));
    const scoreKey = `live_score_${teamId}_${match.providerEventId}`;
    const previous = await new Promise((resolve) => chrome.storage.local.get(scoreKey, (result) => resolve(result[scoreKey])));
    chrome.storage.local.set({ [scoreKey]: scores });
    if (!Array.isArray(previous) || scores.every((score, index) => score <= Number(previous[index] || 0))) return;
    const eventKey = `notified_goal_${teamId}_${match.providerEventId}_${scores.join('-')}`;
    if (await storageHas(eventKey)) return;
    const home = competitors.find((competitor) => competitor.homeAway === 'home');
    const away = competitors.find((competitor) => competitor.homeAway === 'away');
    showNotification('Goal update', `${home?.team?.displayName || 'Home'} ${home?.score || 0}–${away?.score || 0} ${away?.team?.displayName || 'Away'}`);
    chrome.storage.local.set({ [eventKey]: true });
  } catch (_error) { /* provider failure is non-blocking */ }
}
function storageHas(key) { return new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(Boolean(result[key])))); }
function showNotification(title, message) { if (chrome.notifications) chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-128.png', title, message }); }

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
      fetchStandings(request.teamId || 'timbers').then((standings) => sendResponse({ standings, source: standings ? 'live' : null })).catch(() => sendResponse({ standings: null }));
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
    fetchAndParseSchedule,
    getMatchDataWithFallback,
    getBundledFallback,
  };
}
