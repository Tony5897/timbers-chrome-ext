var pdxMatchdayPreviewMode = !globalThis.chrome?.storage?.local || !globalThis.chrome?.runtime?.sendMessage;
if (pdxMatchdayPreviewMode) {
  const previewParams = new URLSearchParams(globalThis.location?.search || '');
  const previewTeam = previewParams.get('team') === 'thorns' ? 'thorns' : 'timbers';
  const previewScheme = previewParams.get('scheme') === 'away' ? 'away' : 'home';
  const previewMatches = {
    timbers: { teamId: 'timbers', opponent: 'Charlotte FC', date: 'Oct 24, 2026', time: '7:30 PM PT', location: 'Providence Park', venue: 'Providence Park', tv: 'Apple TV', matchTimestamp: Date.now() + 59 * 86400000, homeAway: 'home', competition: 'MLS' },
    thorns: { teamId: 'thorns', opponent: 'North Carolina Courage', date: 'Oct 23, 2026', time: '7:00 PM PT', location: 'Providence Park', venue: 'Providence Park', tv: 'Prime Video', matchTimestamp: Date.now() + 58 * 86400000, homeAway: 'home', competition: 'NWSL' },
  };
  Object.values(previewMatches).forEach((match) => { match.homeAway = previewScheme; });
  const previewStorage = { selectedTeam: previewTeam };
  globalThis.chrome = { runtime: { lastError: null, sendMessage: (request, callback) => callback(request.action === 'getStandings' ? { standings: [{ rank: 1, club: request.teamId === 'thorns' ? 'Kansas City Current' : 'Portland Timbers', points: 42, highlight: request.teamId !== 'thorns' }, { rank: 2, club: request.teamId === 'thorns' ? 'Portland Thorns FC' : 'Seattle Sounders FC', points: 39, highlight: request.teamId === 'thorns' }], source: 'live' } : { matchData: previewMatches[request.teamId] || previewMatches.timbers, source: 'live' }) }, storage: { local: { get: (keys, callback) => { const requested = Array.isArray(keys) ? keys : [keys]; callback(Object.fromEntries(requested.filter((key) => key in previewStorage).map((key) => [key, previewStorage[key]]))); }, set: (values, callback) => { Object.assign(previewStorage, values); callback?.(); } } } };
  globalThis.MatchdayAuth = { hasSession: () => Promise.resolve(false) };
  globalThis.CommunityVotes = { get: () => Promise.resolve(null), increment: () => Promise.resolve({ synced: false }), deleteInstallation: () => Promise.resolve({ deleted: true }) };
}
document.addEventListener('DOMContentLoaded', () => {
  const TEAM_CONFIG = {
    timbers: { shortName: 'Timbers', scheme: 'away', schemeLabels: { home: 'Home colors — Providence Park green and gold', away: 'Away colors — Civic Stadium ice and green' }, club: 'https://www.timbers.com', schedule: 'https://www.timbers.com/schedule/' },
    thorns: { shortName: 'Thorns', scheme: 'away', schemeLabels: { home: 'Home colors — Electric Bloom pink and yellow', away: 'Away colors — black and ember red' }, club: 'https://www.thorns.com', schedule: 'https://www.thorns.com/schedule' },
  };
  const $ = (id) => document.getElementById(id);
  const state = { team: 'timbers', tab: 'match', match: null, source: null, standings: [], matchTimestamp: null, community: null, voted: false };
  let timer;

  function config() { return TEAM_CONFIG[state.team]; }
  function save(key, value) { chrome.storage.local.set({ [key]: value }, () => {}); }
  function load(key) { return new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r?.[key]))); }

  function applyTeam(team, persist = true) {
    state.team = TEAM_CONFIG[team] ? team : 'timbers';
    const teamConfig = config();
    document.body.dataset.team = state.team;
    document.body.dataset.scheme = teamConfig.scheme;
    $('match-team-name').textContent = teamConfig.shortName;
    $('scheme-tag').textContent = teamConfig.scheme[0].toUpperCase() + teamConfig.scheme.slice(1);
    $('settings-scheme-tag').textContent = $('scheme-tag').textContent;
    $('scheme-label').textContent = teamConfig.schemeLabels[teamConfig.scheme];
    $('club-link').href = teamConfig.club;
    $('footer-schedule-link').href = teamConfig.schedule;
    $('schedule-link').href = teamConfig.schedule;
    document.querySelectorAll('.team-option').forEach((option) => option.classList.toggle('is-selected', option.querySelector('input').value === state.team));
    document.querySelectorAll('input[name="team"]').forEach((input) => { input.checked = input.value === state.team; });
    if (persist) save('selectedTeam', state.team);
    if (state.tab === 'standings') requestStandings();
    requestMatch();
  }

  function setTab(tab) {
    state.tab = tab;
    ['match', 'standings', 'settings'].forEach((name) => { const active = name === tab; $(`panel-${name}`).classList.toggle('hidden', !active); $(`tab-${name}`).classList.toggle('is-active', active); $(`tab-${name}`).setAttribute('aria-selected', String(active)); });
    if (tab === 'standings') requestStandings();
  }

  function requestMatch() {
    $('match-skeleton').classList.remove('hidden'); $('match-info').classList.add('hidden'); $('match-error').classList.add('hidden');
    chrome.runtime.sendMessage({ action: 'getMatchData', teamId: state.team }, (response) => {
      if (chrome.runtime.lastError || !response) return showError('Could not retrieve match data.');
      state.source = response.source; state.match = response.matchData || null;
      $('freshness-label').textContent = state.source === 'live' ? 'Live schedule data' : state.source ? 'Cached schedule data' : 'Waiting for schedule data';
      $('freshness-tag').textContent = state.source === 'live' ? 'Live' : state.source ? 'Delayed' : '—';
      $('data-notice').classList.toggle('hidden', state.source === 'live' || !state.source);
      if (!state.match) return showError(response.source === 'no_match' ? 'No upcoming match scheduled. Check the full schedule below.' : 'Could not retrieve match data at this time.');
      displayMatch(state.match, state.source);
    });
  }

  function displayMatch(match, source) {
    if (match.teamId && match.teamId !== state.team) return;
    $('match-skeleton').classList.add('hidden'); $('match-info').classList.remove('hidden'); $('match-error').classList.add('hidden');
    $('match-opponent').textContent = match.opponent || 'TBA'; $('match-status').textContent = match.homeAway === 'home' ? 'Home' : 'Away';
    const scheme = match.homeAway === 'home' ? 'home' : 'away';
    document.body.dataset.scheme = scheme;
    $('scheme-tag').textContent = scheme === 'home' ? 'Home' : 'Away';
    $('settings-scheme-tag').textContent = $('scheme-tag').textContent;
    $('scheme-label').textContent = config().schemeLabels[scheme];
    $('match-details').textContent = '';
    [['Date', match.date], ['Time', match.time], ['Location', match.location || match.venue], ['TV / Stream', match.tv]].forEach(([label, value]) => {
      const item = document.createElement('div'); item.className = 'detail-item'; const lbl = document.createElement('span'); lbl.className = 'detail-label'; lbl.textContent = label; item.appendChild(lbl);
      const display = value || 'N/A'; const isApple = label === 'TV / Stream' && /apple\s*tv/i.test(String(value || '')); const val = document.createElement(isApple ? 'a' : 'span'); val.className = isApple ? 'detail-value detail-value-link' : 'detail-value'; val.textContent = display;
      if (isApple) { val.href = 'https://tv.apple.com/us/channel/mls/tvs.sbd.7000'; val.target = '_blank'; val.rel = 'noopener noreferrer'; } item.appendChild(val); $('match-details').appendChild(item);
    });
    if (typeof match.matchTimestamp === 'number') { state.matchTimestamp = match.matchTimestamp; startCountdown(match.matchTimestamp, source); hydrateVote(match.matchTimestamp); }
  }

  function showError(message) { $('match-skeleton').classList.add('hidden'); $('match-info').classList.add('hidden'); $('match-error').classList.remove('hidden'); $('match-error-text').textContent = message; }
  function startCountdown(timestamp, source) { if (timer && typeof clearInterval === 'function') clearInterval(timer); const update = () => { const diff = timestamp - Date.now(); if (diff <= 0) { $('countdown-wrap').classList.add('hidden'); $('live-badge').classList.toggle('hidden', source !== 'live'); return; } $('live-badge').classList.add('hidden'); $('countdown-wrap').classList.remove('hidden'); const pad = (v) => String(v).padStart(2, '0'); $('cd-days').textContent = pad(Math.floor(diff / 86400000)); $('cd-hours').textContent = pad(Math.floor((diff % 86400000) / 3600000)); $('cd-mins').textContent = pad(Math.floor((diff % 3600000) / 60000)); $('cd-secs').textContent = pad(Math.floor((diff % 60000) / 1000)); }; update(); if (typeof setInterval === 'function') timer = setInterval(update, 1000); }

  function requestStandings() { $('standings-note').textContent = 'Loading current standings…'; $('standings-body').innerHTML = '<tr><td colspan="3">Loading standings…</td></tr>'; chrome.runtime.sendMessage({ action: 'getStandings', teamId: state.team }, (response) => { if (chrome.runtime.lastError || !response?.standings) { $('standings-note').textContent = 'Standings are temporarily unavailable.'; $('standings-body').innerHTML = '<tr><td colspan="3">Check the official standings.</td></tr>'; return; } state.standings = response.standings; $('standings-note').textContent = response.source === 'live' ? 'Current provider standings.' : 'Standings data may be delayed.'; $('standings-body').innerHTML = ''; response.standings.forEach((row) => { const tr = document.createElement('tr'); if (row.highlight) tr.className = 'is-highlighted'; tr.innerHTML = `<td>${row.rank}</td><td>${escapeHtml(row.club)}</td><td>${row.points}</td>`; $('standings-body').appendChild(tr); }); }); }
  function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

  async function hydrateVote(timestamp) { const has = await load(`hasVoted_${timestamp}`); state.voted = Boolean(has); if (has) { const local = await load(`votes_${timestamp}`); showVoteResults(state.community || local || { high: 0, medium: 0, low: 0 }); } if (globalThis.CommunityVotes) { state.community = await CommunityVotes.get(timestamp); if (state.community && state.voted) showVoteResults(state.community); else if (state.community) { const total = state.community.high + state.community.medium + state.community.low; if (total) { $('community-count').textContent = `${total} accepted community response${total === 1 ? '' : 's'}`; $('community-count').classList.remove('hidden'); } } } }
  function showVoteResults(votes) { $('vote-buttons').classList.add('hidden'); $('vote-results').classList.remove('hidden'); $('community-count').classList.add('hidden'); const total = (votes.high || 0) + (votes.medium || 0) + (votes.low || 0); ['high', 'medium', 'low'].forEach((key) => { const pct = total ? Math.round(((votes[key] || 0) / total) * 100) : 0; $(`pct-${key}`).textContent = `${pct}%`; $(`bar-${key}`).style.width = `${pct}%`; }); $('vote-thanks').textContent = `Thanks for voting! ${total} response${total === 1 ? '' : 's'} counted${state.community ? ' in the community total' : ''}.`; }
  document.querySelectorAll('.vote-btn').forEach((button) => button.addEventListener('click', async () => { if (!state.matchTimestamp) return; const choice = button.dataset.vote; const key = `votes_${state.matchTimestamp}`; const votes = (await load(key)) || { high: 0, medium: 0, low: 0 }; votes[choice] = (votes[choice] || 0) + 1; state.voted = true; await new Promise((resolve) => chrome.storage.local.set({ [key]: votes, [`hasVoted_${state.matchTimestamp}`]: true }, resolve)); showVoteResults(state.community ? { ...state.community, [choice]: (state.community[choice] || 0) + 1 } : votes); if (globalThis.CommunityVotes) { const result = await CommunityVotes.increment(state.matchTimestamp, choice); $('community-sync').classList.remove('hidden'); $('community-sync').textContent = result.synced ? 'Response accepted for the anonymous-installation community total.' : 'Saved on this device. Community sync will retry.'; if (result.aggregate) { state.community = result.aggregate; showVoteResults(result.aggregate); } } }));
  $('community-delete').addEventListener('click', async () => { if (!globalThis.CommunityVotes || !window.confirm('Delete retained community responses and this anonymous community identity? This cannot be undone.')) return; $('community-delete').disabled = true; $('community-delete-status').textContent = 'Deleting retained community data…'; $('community-delete-status').classList.remove('hidden'); const result = await CommunityVotes.deleteInstallation(); $('community-delete-status').textContent = result.deleted ? 'Retained responses were deleted. Anonymous account removal is scheduled.' : 'Deletion could not be completed. Please try again.'; $('community-delete').disabled = !result.deleted; });
  $('notification-toggle').addEventListener('click', async () => { const enabled = !(await load('notificationsEnabled')); save('notificationsEnabled', enabled); updateNotifications(enabled); chrome.runtime.sendMessage({ action: 'setNotifications', enabled }); });
  function updateNotifications(enabled) { $('notification-toggle').setAttribute('aria-checked', String(enabled)); $('notification-label').textContent = enabled ? 'Kickoff + goal alerts on' : 'Kickoff + goal alerts off'; }
  document.querySelectorAll('input[name="team"]').forEach((input) => input.addEventListener('change', () => applyTeam(input.value)));
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setTab(button.id.replace('tab-', ''))));
  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('.tab')];
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    setTab(tabs[next].id.replace('tab-', ''));
  });
  applyTeam('timbers', false);
  chrome.storage.local.get(['selectedTeam', 'notificationsEnabled'], (stored) => {
    if (stored?.selectedTeam && stored.selectedTeam !== state.team) applyTeam(stored.selectedTeam);
    updateNotifications(Boolean(stored?.notificationsEnabled));
  });
});
