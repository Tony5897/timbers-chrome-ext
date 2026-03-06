const SELECTORS = {
  matchRow: '.match-row',
  club: '.match-club',
  date: '.match-date',
  time: '.match-time',
  venue: '.match-venue',
};

const SCHEDULE_URL = 'https://www.mlssoccer.com/schedule/portland-timbers-matches';

async function fetchAndParseSchedule() {
  try {
    const response = await fetch(SCHEDULE_URL);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const nextMatch = doc.querySelector(SELECTORS.matchRow);
    if (!nextMatch) {
      return null;
    }

    const clubs = nextMatch.querySelectorAll(SELECTORS.club);
    const opponent = (clubs.length > 1 ? clubs[1].textContent.trim() : '') || 'TBA';

    const dateEl = nextMatch.querySelector(SELECTORS.date);
    const timeEl = nextMatch.querySelector(SELECTORS.time);
    const venueEl = nextMatch.querySelector(SELECTORS.venue);

    const date = (dateEl && dateEl.textContent.trim()) || 'TBA';
    const time = (timeEl && timeEl.textContent.trim()) || 'TBA';
    const location = (venueEl && venueEl.textContent.trim()) || 'TBA';
    const tv = 'Check Local Listings';

    const matchTimestamp = new Date(`${date} ${time}`).getTime();
    return { opponent, date, time, location, tv, matchTimestamp };
  } catch (error) {
    console.error('Error fetching or parsing schedule:', error);
    return null;
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getMatchData') {
      fetchAndParseSchedule()
        .then((matchData) => sendResponse({ matchData }))
        .catch(() => sendResponse({ matchData: null }));
      return true;
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.create('fetchDataAlarm', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'fetchDataAlarm') {
      fetchAndParseSchedule().then((matchData) => {
        if (matchData) {
          chrome.storage.local.set({ latestMatchData: matchData });
        }
      });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchAndParseSchedule };
}
