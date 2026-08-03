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
  const deleteControl = document.getElementById('community-delete-control');
  const deleteButton = document.getElementById('community-delete');
  const deleteStatus = document.getElementById('community-delete-status');
  let timerInterval;
  let currentMatchTimestamp = null;
  let communityData = null;
  let hasVotedThisSession = false;

  const dataNotice = document.getElementById('data-notice');

  if (typeof MatchdayAuth !== 'undefined' && typeof MatchdayAuth.hasSession === 'function') {
    MatchdayAuth.hasSession().then((hasSession) => {
      if (hasSession) deleteControl.classList.remove('hidden');
    }).catch(() => undefined);
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
      if (typeof response.matchData.matchTimestamp === 'number') {
        currentMatchTimestamp = response.matchData.matchTimestamp;
        const hasVotedKey = `hasVoted_${currentMatchTimestamp}`;
        const votesKey = `votes_${currentMatchTimestamp}`;

        // Check local vote state.
        chrome.storage.local.get([hasVotedKey, votesKey], (res) => {
          if (chrome.runtime.lastError) return;
          if (res[hasVotedKey]) {
            hasVotedThisSession = true;
            showVoteResults(communityData || res[votesKey] || { high: 0, medium: 0, low: 0 });
          }
        });

        // Fetch community totals in background — updates UI when resolved.
        if (typeof CommunityVotes !== 'undefined') {
          CommunityVotes.get(currentMatchTimestamp).then((data) => {
            communityData = data;
            if (!data) return;
            const countEl = document.getElementById('community-count');
            if (!hasVotedThisSession) {
              // Show participation count alongside the vote buttons.
              const total = data.high + data.medium + data.low;
              if (total > 0 && countEl) {
                countEl.textContent = `${total} accepted community response${total === 1 ? '' : 's'}`;
                countEl.classList.remove('hidden');
              }
            } else if (!voteResults.classList.contains('hidden')) {
              // User already voted — refresh results with community totals.
              showVoteResults(data);
            }
          });
        }
      }
    } else if (response && response.source === 'no_match') {
      showError('No upcoming match scheduled. Check the full schedule below.');
    } else {
      showError('Could not retrieve match data at this time.');
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

  document.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentMatchTimestamp) return;
      const vote = btn.getAttribute('data-vote');
      const votesKey = `votes_${currentMatchTimestamp}`;
      const hasVotedKey = `hasVoted_${currentMatchTimestamp}`;

      btn.classList.add('selected');
      hasVotedThisSession = true;

      chrome.storage.local.get([votesKey], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error reading votes:', chrome.runtime.lastError.message);
          return;
        }
        const votes = result[votesKey] || { high: 0, medium: 0, low: 0 };
        votes[vote] = (votes[vote] || 0) + 1;

        chrome.storage.local.set({ [votesKey]: votes, [hasVotedKey]: true }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving vote:', chrome.runtime.lastError.message);
            return;
          }
          const syncEl = document.getElementById('community-sync');
          if (typeof CommunityVotes !== 'undefined') {
            CommunityVotes.increment(currentMatchTimestamp, vote).then((result) => {
              if (!syncEl) return;
              syncEl.classList.remove('hidden');
              if (!result?.synced) {
                syncEl.textContent = 'Saved on this device. Community sync will retry.';
                return;
              }
              syncEl.textContent = 'Response accepted for the anonymous-installation community total.';
              deleteControl.classList.remove('hidden');
              if (result.aggregate) {
                communityData = result.aggregate;
                showVoteResults(result.aggregate);
              }
            });
          }
          // Optimistically apply this vote to community totals for immediate display.
          const displayVotes = communityData
            ? { ...communityData, [vote]: (communityData[vote] || 0) + 1 }
            : votes;
          showVoteResults(displayVotes);
        });
      });
    });
  });

  deleteButton.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'Delete retained community responses and this anonymous community identity? This cannot be undone.',
    );
    if (!confirmed || typeof CommunityVotes === 'undefined') return;

    deleteButton.disabled = true;
    deleteStatus.textContent = 'Deleting retained community data…';
    deleteStatus.classList.remove('hidden');
    const result = await CommunityVotes.deleteInstallation();
    if (!result?.deleted) {
      deleteStatus.textContent = 'Deletion could not be completed. Please try again.';
      deleteButton.disabled = false;
      return;
    }

    communityData = null;
    hasVotedThisSession = false;
    voteResults.classList.add('hidden');
    voteButtons.classList.remove('hidden');
    document.querySelectorAll('.vote-btn').forEach((button) => button.classList.remove('selected'));
    document.getElementById('community-count').classList.add('hidden');
    document.getElementById('community-sync').classList.add('hidden');
    deleteButton.classList.add('hidden');
    deleteStatus.textContent = 'Retained responses were deleted. Anonymous account removal is scheduled.';
  });

  function showVoteResults(votes) {
    voteButtons.classList.add('hidden');
    voteResults.classList.remove('hidden');
    const countEl = document.getElementById('community-count');
    if (countEl) countEl.classList.add('hidden');

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

    const isCommunity = communityData !== null;
    const label = total === 1 ? '1 vote' : `${total} votes`;
    const suffix = isCommunity ? ' accepted in the community total' : '';
    voteThanks.textContent = `Thanks for voting! ${label} cast${suffix}.`;
  }
});
