const selectors = {
  matchRow: {
    primary: '.match-row',
    fallback: '.match-card, .game-row'
  },
  opponent: {
    primary: '.match-club:nth-child(2), .match-club:eq(1)',
    fallback: '.away-team, .opponent-name'
  },
  date: {
    primary: '.match-date',
    fallback: '.game-date, .event-date'
  },
  time: {
    primary: '.match-time',
    fallback: '.game-time, .event-time'
  },
  location: {
    primary: '.match-venue',
    fallback: '.stadium, .venue-name'
  }
};

/**
 * API configuration for fetching data
 */

const apiConfig = {
  baseUrl: 'https://api-football-v1.p.rapidapi.com/v3',
  host: 'api-football-v1.p.rapidapi.com',
  // We'll load this from environment later
  teamId: 1600, // Portland Timbers team ID
  leagueId: 253, // MLS league ID
  endpoints: {
    fixtures: '/fixtures',
    teams: '/teams'
  }
};

module.exports = { selectors, apiConfig };