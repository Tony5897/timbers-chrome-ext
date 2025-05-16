document.addEventListener('DOMContentLoaded', () => {
    const matchInfoDiv = document.getElementById('match-info');
    const countdownDiv = document.getElementById('countdown');
    const voteResult = document.getElementById('vote-result');
    let timerInterval; // Declare timerInterval here to manage it across calls

    // Request match data from the background service worker
    chrome.runtime.sendMessage({ action: "getMatchData" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Error fetching match data:", chrome.runtime.lastError.message);
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
        matchInfoDiv.innerHTML = `
          <p><strong>Opponent:</strong> ${matchData.opponent || 'N/A'}</p>
          <p><strong>Date:</strong> ${matchData.date || 'N/A'}</p>
          <p><strong>Time:</strong> ${matchData.time || 'N/A'}</p>
          <p><strong>Location:</strong> ${matchData.location || 'N/A'}</p>
          <p><strong>TV/Stream:</strong> ${matchData.tv || 'N/A'}</p>
        `;
        if (typeof matchData.matchTimestamp === 'number') {
            startCountdown(matchData.matchTimestamp);
        } else {
            countdownDiv.textContent = "Match time unavailable.";
        }
    }

    function startCountdown(matchTimestamp) {
        if (timerInterval) {
            clearInterval(timerInterval); // Clear any existing interval
        }

        function updateCountdown() {
            const now = Date.now();
            const diff = matchTimestamp - now;

            if (diff <= 0) {
                countdownDiv.textContent = "Match is live!";
                clearInterval(timerInterval);
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000); // Added seconds

            countdownDiv.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
        }
        updateCountdown(); // Initial call
        timerInterval = setInterval(updateCountdown, 1000); // Update every second
    }

    document.querySelectorAll('.fan-engagement button[data-vote]').forEach(button => {
        button.addEventListener('click', () => {
            const vote = button.getAttribute('data-vote');
            chrome.storage.local.get(['votes'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting votes:", chrome.runtime.lastError.message);
                    let resultEl = voteResult || document.getElementById('vote-result');
                    if (!resultEl) {
                        resultEl = document.createElement('p');
                        resultEl.id = 'vote-result';
                        document.body.appendChild(resultEl);
                    }
                    resultEl.textContent = "Error: Could not retrieve votes.";
                    chrome.runtime.lastError = null;
                    return;
                }
                const votes = result.votes || { high: 0, medium: 0, low: 0 };
                votes[vote] = (votes[vote] || 0) + 1;
                chrome.storage.local.set({ votes }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Error setting votes:", chrome.runtime.lastError.message);
                        voteResult.textContent = "Error: Could not retrieve votes.";
                        chrome.runtime.lastError = null;
                        return;
                    }
                    voteResult.textContent = `Thanks for voting! Votes: High ${votes.high}, Medium ${votes.medium}, Low ${votes.low}`;
                });
            });
        });
    });
});