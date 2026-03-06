document.addEventListener('DOMContentLoaded', () => {
  const matchInfoDiv = document.getElementById('match-info');
  const countdownDiv = document.getElementById('countdown');
  const voteResult = document.getElementById('vote-result');
  let timerInterval;

  chrome.runtime.sendMessage({ action: 'getMatchData' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error fetching match data:', chrome.runtime.lastError.message);
      matchInfoDiv.textContent = 'Error: Could not retrieve match data.';
      return;
    }
    if (response && response.matchData) {
      displayMatchData(response.matchData);
    } else {
      matchInfoDiv.textContent = 'Could not retrieve match data at this time.';
    }
  });

  function displayMatchData(matchData) {
    matchInfoDiv.textContent = '';

    const fields = [
      ['Opponent', matchData.opponent],
      ['Date', matchData.date],
      ['Time', matchData.time],
      ['Location', matchData.location],
      ['TV/Stream', matchData.tv],
    ];

    fields.forEach(([label, value]) => {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = label + ':';
      p.appendChild(strong);
      p.appendChild(document.createTextNode(' ' + (value || 'N/A')));
      matchInfoDiv.appendChild(p);
    });

    if (typeof matchData.matchTimestamp === 'number') {
      startCountdown(matchData.matchTimestamp);
    } else {
      countdownDiv.textContent = 'Match time unavailable.';
    }
  }

  function startCountdown(matchTimestamp) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    function updateCountdown() {
      const now = Date.now();
      const diff = matchTimestamp - now;

      if (diff <= 0) {
        countdownDiv.textContent = 'Match is live!';
        clearInterval(timerInterval);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      countdownDiv.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
    }

    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);
  }

  document.querySelectorAll('.fan-engagement button[data-vote]').forEach((button) => {
    button.addEventListener('click', () => {
      const vote = button.getAttribute('data-vote');
      chrome.storage.local.get(['votes'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error reading votes:', chrome.runtime.lastError.message);
          if (voteResult) {
            voteResult.textContent = 'Error: Could not retrieve votes.';
          }
          return;
        }
        const votes = result.votes || { high: 0, medium: 0, low: 0 };
        votes[vote] = (votes[vote] || 0) + 1;
        chrome.storage.local.set({ votes }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving vote:', chrome.runtime.lastError.message);
            if (voteResult) {
              voteResult.textContent = 'Error: Could not save vote.';
            }
            return;
          }
          if (voteResult) {
            voteResult.textContent = `Thanks for voting! Votes: High ${votes.high}, Medium ${votes.medium}, Low ${votes.low}`;
          }
        });
      });
    });
  });
});
