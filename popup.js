document.addEventListener('DOMContentLoaded', () => {
  const skeleton = document.getElementById('match-skeleton');
  const matchInfo = document.getElementById('match-info');
  const matchError = document.getElementById('match-error');
  const matchErrorText = document.getElementById('match-error-text');
  const opponentEl = document.getElementById('match-opponent');
  const detailsEl = document.getElementById('match-details');
  const countdownWrap = document.getElementById('countdown-wrap');
  const liveBadge = document.getElementById('live-badge');
  const voteButtons = document.getElementById('vote-buttons');
  const voteResults = document.getElementById('vote-results');
  const voteThanks = document.getElementById('vote-thanks');
  let timerInterval;

  const dataNotice = document.getElementById('data-notice');

  if (typeof Telemetry !== 'undefined') {
    Telemetry.sendEvent('popup_open', { ui_surface: 'popup' });
  }

  chrome.runtime.sendMessage({ action: 'getMatchData' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error fetching match data:', chrome.runtime.lastError.message);
      showError('Could not retrieve match data.');
      return;
    }
    if (response && response.matchData) {
      displayMatchData(response.matchData, response.source);
      if (response.source === 'cache' || response.source === 'fallback') {
        dataNotice.classList.remove('hidden');
      }
      if (typeof Telemetry !== 'undefined') {
        const evt = response.source === 'live'
          ? 'match_fetch_live_success'
          : response.source === 'cache'
            ? 'match_fetch_cache_used'
            : 'match_fetch_fallback_used';
        Telemetry.sendEvent(evt, {
          source: response.source,
          has_match_data: true,
          stale_notice_shown: response.source !== 'live',
          ui_surface: 'popup',
        });
      }
    } else {
      showError('Could not retrieve match data at this time.');
      if (typeof Telemetry !== 'undefined') {
        Telemetry.sendEvent('match_fetch_failed', { has_match_data: false, ui_surface: 'popup' });
      }
    }
  });

  function showError(msg) {
    skeleton.classList.add('hidden');
    matchInfo.classList.add('hidden');
    matchError.classList.remove('hidden');
    matchErrorText.textContent = msg;
  }

  function displayMatchData(matchData, source) {
    skeleton.classList.add('hidden');
    matchError.classList.add('hidden');
    matchInfo.classList.remove('hidden');

    opponentEl.textContent = matchData.opponent || 'TBA';

    detailsEl.textContent = '';
    const details = [
      ['Date', matchData.date],
      ['Time', matchData.time],
      ['Location', matchData.location],
      ['TV/Stream', matchData.tv],
    ];
    details.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'detail-item';

      const lbl = document.createElement('span');
      lbl.className = 'detail-label';
      lbl.textContent = label;
      item.appendChild(lbl);

      const val = document.createElement('span');
      val.className = 'detail-value';
      val.textContent = value || 'N/A';
      item.appendChild(val);

      detailsEl.appendChild(item);
    });

    if (typeof matchData.matchTimestamp === 'number') {
      startCountdown(matchData.matchTimestamp, source);
    }
  }

  function startCountdown(matchTimestamp, source) {
    const daysEl = document.getElementById('cd-days');
    const hoursEl = document.getElementById('cd-hours');
    const minsEl = document.getElementById('cd-mins');
    const secsEl = document.getElementById('cd-secs');

    if (timerInterval) {
      clearInterval(timerInterval);
    }

    function pad(n) {
      return String(n).padStart(2, '0');
    }

    function update() {
      const diff = matchTimestamp - Date.now();

      if (diff <= 0) {
        countdownWrap.classList.add('hidden');
        if (source === 'live') {
          liveBadge.classList.remove('hidden');
        }
        clearInterval(timerInterval);
        return;
      }

      countdownWrap.classList.remove('hidden');
      liveBadge.classList.add('hidden');

      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      daysEl.textContent = pad(d);
      hoursEl.textContent = pad(h);
      minsEl.textContent = pad(m);
      secsEl.textContent = pad(s);
    }

    update();
    timerInterval = setInterval(update, 1000);
  }

  // ── Voting ──────────────────────────────────────────────

  chrome.storage.local.get(['hasVoted', 'votes'], (result) => {
    if (chrome.runtime.lastError) return;
    if (result.hasVoted) {
      showVoteResults(result.votes || { high: 0, medium: 0, low: 0 });
    }
  });

  const scheduleLink = document.querySelector('.schedule-link');
  if (scheduleLink) {
    scheduleLink.addEventListener('click', () => {
      if (typeof Telemetry !== 'undefined') {
        Telemetry.sendEvent('schedule_link_clicked', { ui_surface: 'popup' });
      }
    });
  }

  document.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const vote = btn.getAttribute('data-vote');

      btn.classList.add('selected');

      chrome.storage.local.get(['votes'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error reading votes:', chrome.runtime.lastError.message);
          return;
        }
        const votes = result.votes || { high: 0, medium: 0, low: 0 };
        votes[vote] = (votes[vote] || 0) + 1;

        chrome.storage.local.set({ votes, hasVoted: true }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving vote:', chrome.runtime.lastError.message);
            return;
          }
          showVoteResults(votes);
        });
      });
    });
  });

  function showVoteResults(votes) {
    voteButtons.classList.add('hidden');
    voteResults.classList.remove('hidden');

    const total = (votes.high || 0) + (votes.medium || 0) + (votes.low || 0);

    ['high', 'medium', 'low'].forEach((key) => {
      const count = votes[key] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;

      document.getElementById('pct-' + key).textContent = pct + '%';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('bar-' + key).style.width = pct + '%';
        });
      });
    });

    const totalVotes = total === 1 ? '1 vote' : total + ' votes';
    voteThanks.textContent = 'Thanks for voting! ' + totalVotes + ' cast.';
  }
});
