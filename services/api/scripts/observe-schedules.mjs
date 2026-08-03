import fs from 'node:fs';
import path from 'node:path';
import { parseCompatibilitySchedule } from '../lib/provider.js';

const teamSources = [
  { teamId: 'timbers', competitionId: 'mls', league: 'usa.1', providerTeamId: '9723' },
  {
    teamId: 'timbers',
    competitionId: 'leagues-cup',
    league: 'concacaf.leagues.cup',
    providerTeamId: '9723',
  },
  { teamId: 'thorns', competitionId: 'nwsl', league: 'usa.nwsl', providerTeamId: '15362' },
];
const options = parseArguments(process.argv.slice(2));
const season = Number(options.season ?? new Date().getUTCFullYear());
if (!Number.isInteger(season) || season < 2020 || season > 2100) throw new Error('A valid --season is required.');

const observations = [];
for (const source of teamSources) {
  for (const eventClass of ['results', 'fixtures']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const fixtureQuery = eventClass === 'fixtures' ? '&fixture=true' : '';
    const endpoint = `https://site.api.espn.com/apis/site/v2/sports/soccer/${source.league}/teams/${source.providerTeamId}/schedule?season=${season}${fixtureQuery}`;
    const startedAt = Date.now();
    try {
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${source.teamId}_${eventClass}_provider_http_${response.status}`);
      const events = parseCompatibilitySchedule(await response.json(), source.teamId);
      const uniqueEventIds = new Set(events.map((event) => event.providerEventId));
      const kickoffTimes = events.map((event) => event.kickoffMs).sort((left, right) => left - right);
      observations.push({
        teamId: source.teamId,
        competitionId: source.competitionId,
        eventClass,
        providerTeamId: source.providerTeamId,
        leaguePath: source.league,
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        eventCount: events.length,
        uniqueEventIdCount: uniqueEventIds.size,
        duplicateEventIdCount: events.length - uniqueEventIds.size,
        earliestKickoff: kickoffTimes.length > 0 ? new Date(kickoffTimes[0]).toISOString() : null,
        latestKickoff: kickoffTimes.length > 0 ? new Date(kickoffTimes.at(-1)).toISOString() : null,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

const artifact = {
  schemaVersion: 1,
  classification: 'provider_evaluation_reduced',
  source: 'espn_site_api_evaluation',
  observedAt: new Date().toISOString(),
  season,
  rawPayloadStored: false,
  caveat: 'Technical observation only. This does not establish completeness, reliability, redistribution rights, push rights, or production suitability.',
  observations,
};
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (options.output) {
  const output = path.resolve(options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, serialized, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${output}\n`);
} else {
  process.stdout.write(serialized);
}

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`Invalid argument near ${name ?? 'end of input'}.`);
    parsed[name.slice(2)] = value;
  }
  return parsed;
}
