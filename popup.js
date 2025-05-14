document.addEventListener('DOMContentLoaded', () => {
    const matchInfoDiv = document.getElementById('match-info');
    const countdownDiv = document.getElementById('countdown');
    const voteResult = document.getElementById('vote-result');
  
    // Request match data from the background service worker
    chrome.runtime.sendMessage({ action: "getMatchData" }, (response) => {
      if (response && response.matchData) {
        displayMatchData(response.matchData);
      } else {
        matchInfoDiv.textContent = 'Could not retrieve match data.';
      }
    });

    function displayMatchData(matchData) {
        matchInfoDiv.innerHTML = `
          <p><strong>Opponent:</strong> ${matchData.opponent}</p>
          <p><strong>Date:</strong> ${matchData.date}</p>
          <p><strong>Time:</strong> ${matchData.time}</p>
          <p><strong>Location:</strong> ${matchData.location}</p>
          <p><strong>TV/Stream:</strong> ${matchData.tv}</p>
        `;
        startCountdown(matchData.matchTimestamp);
      }

      // Countdown timer using match timestamp
  function startCountdown(matchTimestamp) {
    function updateCountdown() {
      const now = Date.now();
      const diff = matchTimestamp - now;
      if (diff <= 0) {
        countdownDiv.textContent = "Match is live!";
        clearInterval(timerInterval);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      countdownDiv.textContent = `${days}d ${hours}h ${minutes}m remaining`;
    }
    updateCountdown();
    const timerInterval = setInterval(updateCountdown, 60000);
  }

  // Fan Engagement: Vote handling
  document.querySelectorAll('.fan-engagement button').forEach(button => {
    button.addEventListener('click', () => {
      const vote = button.getAttribute('data-vote');
      chrome.storage.local.get(['votes'], (result) => {
        const votes = result.votes || { high: 0, medium: 0, low: 0 };
        votes[vote] = (votes[vote] || 0) + 1;
        chrome.storage.local.set({ votes }, () => {
          voteResult.textContent = `Thanks for voting! Votes: High ${votes.high}, Medium ${votes.medium}, Low ${votes.low}`;
        });
      });
    });
  });
});