// For testing purposes
if (typeof chrome === 'undefined') {
  global.chrome = {
    runtime: { onMessage: { addListener: () => {} } },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    storage: { local: { set: () => {} } }
  };
}

const cheerio = require('cheerio');

async function fetchAndParseSchedule() {
  const url = 'https://www.mlssoccer.com/schedule/portland-timbers-matches';
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const nextMatch = $('.match-row').first();
    const opponent = nextMatch.find('.match-club').eq(1).text().trim() || "TBA";
    const date = nextMatch.find('.match-date').text().trim() || "TBA";
    const time = nextMatch.find('.match-time').text().trim() || "TBA";
    const location = nextMatch.find('.match-venue').text().trim() || "TBA";
    const tv = "Check Local Listings";

    const matchTimestamp = new Date(`${date} ${time}`).getTime();

    return { opponent, date, time, location, tv, matchTimestamp };
  } catch (error) {
    console.error('Error fetching or parsing schedule:', error);
    return null;
  }
}

// Message listener for data requests from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getMatchData") {
    fetchAndParseSchedule().then(matchData => {
      sendResponse({ matchData });
    });
    return true;
  }
});

// Set up periodic updates
chrome.alarms.create("fetchDataAlarm", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fetchDataAlarm") {
    fetchAndParseSchedule().then(matchData => {
      if (matchData) {
        chrome.storage.local.set({ latestMatchData: matchData });
      }
    });
  }
});

module.exports = { fetchAndParseSchedule };
