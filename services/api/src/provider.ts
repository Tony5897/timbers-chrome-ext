import {
  canonicalMatchSchema,
  liveMatchResponseSchema,
  standingSchema,
  type CanonicalMatch,
  type CompetitionId,
  type LiveMatchResponse,
  type Standing,
  type TeamId,
} from '@matchday/contracts';
import { confidencePollIdForMatch, matchIdForProvider } from '@matchday/domain';
import { z } from 'zod';
import { POLL_OPEN_LEAD_MS, pollIdForTimestamp, type PollWindow } from './domain.js';

const ESPN_TEAM_IDS = {
  timbers: '9723',
  thorns: '15362',
} as const;

export type ScheduleSource = {
  teamId: TeamId;
  competitionId: CompetitionId;
  leaguePath: string;
  providerTeamId: string;
};

const TIMBERS_SOURCES: ScheduleSource[] = [
  {
    teamId: 'timbers',
    competitionId: 'mls',
    leaguePath: 'usa.1',
    providerTeamId: ESPN_TEAM_IDS.timbers,
  },
  {
    teamId: 'timbers',
    competitionId: 'leagues-cup',
    leaguePath: 'concacaf.leagues.cup',
    providerTeamId: ESPN_TEAM_IDS.timbers,
  },
];
const THORNS_SOURCES: ScheduleSource[] = [{
  teamId: 'thorns', competitionId: 'nwsl', leaguePath: 'usa.nwsl', providerTeamId: ESPN_TEAM_IDS.thorns,
}];

const eventSchema = z.object({
  id: z.string().min(1),
  date: z.iso.datetime({ offset: true }),
}).passthrough();

const competitorSchema = z.object({
  homeAway: z.enum(['home', 'away']).optional(),
  team: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
  }).passthrough(),
}).passthrough();

const canonicalEventSchema = eventSchema.extend({
  competitions: z.array(z.object({
    competitors: z.array(competitorSchema).min(2),
    venue: z.object({ fullName: z.string().min(1) }).passthrough().optional(),
    status: z.object({
      type: z.object({
        state: z.enum(['pre', 'in', 'post']).optional(),
        completed: z.boolean().optional(),
        name: z.string().optional(),
      }).passthrough(),
    }).passthrough().optional(),
  }).passthrough()).min(1),
});

const scheduleSchema = z.object({
  events: z.array(eventSchema),
}).passthrough();

const canonicalScheduleSchema = z.object({
  events: z.array(canonicalEventSchema),
}).passthrough();

export type CompatibilityTeamId = TeamId;

export type CompatibilityScheduleEvent = {
  teamId: CompatibilityTeamId;
  providerEventId: string;
  kickoffMs: number;
};

export function parseCompatibilitySchedule(
  payload: unknown,
  teamId: CompatibilityTeamId,
): CompatibilityScheduleEvent[] {
  const parsed = scheduleSchema.parse(payload);
  return parsed.events.map((event) => ({
    teamId,
    providerEventId: event.id,
    kickoffMs: Date.parse(event.date),
  }));
}

export function parseCanonicalSchedule(
  payload: unknown,
  source: ScheduleSource,
  dataUpdatedAt: Date,
): CanonicalMatch[] {
  const parsed = canonicalScheduleSchema.parse(payload);
  return parsed.events.map((event) => {
    const competition = event.competitions[0];
    if (!competition) throw new Error('provider_competition_missing');
    const focalTeam = competition.competitors.find(
      (competitor) => competitor.team.id === source.providerTeamId,
    );
    const opponent = competition.competitors.find(
      (competitor) => competitor.team.id !== source.providerTeamId,
    );
    if (!focalTeam || !opponent) throw new Error('provider_competitor_missing');

    return canonicalMatchSchema.parse({
      id: matchIdForProvider('espn', event.id),
      teamId: source.teamId,
      competitionId: source.competitionId,
      provider: 'espn_bootstrap',
      providerEventId: event.id,
      kickoff: new Date(event.date).toISOString(),
      opponent: opponent.team.displayName,
      homeAway: focalTeam.homeAway ?? 'neutral',
      venue: competition.venue?.fullName ?? null,
      broadcasts: (competition.broadcasts as Array<{ names?: string[] }> | undefined)?.flatMap((broadcast) => broadcast.names ?? []) ?? [],
      status: mapMatchStatus(competition.status?.type),
      dataUpdatedAt: dataUpdatedAt.toISOString(),
    });
  });
}

export async function fetchCanonicalMatches(
  teamId: TeamId,
  fetchImplementation: typeof fetch = fetch,
  now = new Date(),
): Promise<CanonicalMatch[]> {
  const sources = teamId === 'thorns' ? THORNS_SOURCES : TIMBERS_SOURCES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const season = now.getUTCFullYear();

  try {
    const responses = await Promise.all(sources.map((source) => fetchImplementation(
      scheduleUrl(source, season),
      {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      },
    )));
    const failedResponse = responses.find((response) => !response.ok);
    if (failedResponse) throw new Error(`provider_http_${failedResponse.status}`);

    const schedules = await Promise.all(responses.map((response) => response.json()));
    const matches = schedules.flatMap((payload, index) => {
      const source = sources[index];
      if (!source) throw new Error('provider_source_missing');
      return parseCanonicalSchedule(payload, source, now);
    });
    return [...new Map(matches.map((match) => [match.id, match])).values()]
      .sort((left, right) => Date.parse(left.kickoff) - Date.parse(right.kickoff));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('provider_http_')) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('provider_timeout');
    if (
      error instanceof z.ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && [
        'invalid_provider_event_id',
        'provider_competition_missing',
        'provider_competitor_missing',
        'provider_source_missing',
      ].includes(error.message))
    ) {
      throw new Error('provider_invalid_response');
    }
    throw new Error('provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCompatibilityPollWindows(
  fetchImplementation: typeof fetch = fetch,
  now = new Date(),
): Promise<PollWindow[]> {
  const [timbers, thorns] = await Promise.all([
    fetchCanonicalMatches('timbers', fetchImplementation, now),
    fetchCanonicalMatches('thorns', fetchImplementation, now),
  ]);
  const matches = [...timbers, ...thorns];
  return matches.map((match) => {
    const matchTimestamp = Date.parse(match.kickoff);
    return {
      pollId: pollIdForTimestamp(matchTimestamp),
      canonicalPollId: confidencePollIdForMatch(match.id),
      matchId: match.id,
      teamId: match.teamId,
      matchTimestamp,
      matchStatus: match.status,
      providerEventId: match.providerEventId,
      opensAtMs: matchTimestamp - POLL_OPEN_LEAD_MS,
      closesAtMs: matchTimestamp,
    };
  });
}

export async function fetchStandings(
  teamId: TeamId,
  fetchImplementation: typeof fetch = fetch,
  now = new Date(),
): Promise<Standing[]> {
  const source = teamId === 'thorns' ? THORNS_SOURCES[0] : TIMBERS_SOURCES[0];
  if (!source) throw new Error('provider_source_missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImplementation(
      `https://site.api.espn.com/apis/v2/sports/soccer/${source.leaguePath}/standings?season=${now.getUTCFullYear()}`,
      { headers: { accept: 'application/json' }, signal: controller.signal },
    );
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const payload = await response.json() as unknown;
    const entries = extractStandingEntries(payload);
    if (entries.length === 0) throw new Error('provider_invalid_response');
    return entries.map((entry) => {
      const stats = (Array.isArray(entry.stats) ? entry.stats : []) as Array<Record<string, unknown>>;
      const stat = (names: string[]) => {
        const found = stats.find((candidate) => names.includes(String(candidate?.name ?? '').toLowerCase()));
        return Number(found?.value ?? 0);
      };
      return standingSchema.parse({
        teamId,
        group: entry.group,
        rank: Math.max(1, Math.trunc(stat(['rank']) || entry.indexInGroup + 1)),
        club: String(entry.team?.displayName ?? entry.team?.name ?? 'Club'),
        points: Math.max(0, Math.trunc(stat(['points', 'pointsfor']))),
        played: Math.max(0, Math.trunc(stat(['gamesplayed', 'played', 'matchesplayed']))),
        wins: Math.max(0, Math.trunc(stat(['wins', 'w']))),
        draws: Math.max(0, Math.trunc(stat(['ties', 'draws', 'd']))),
        losses: Math.max(0, Math.trunc(stat(['losses', 'l']))),
        goalDifference: Math.trunc(stat(['goaldifference', 'gd'])),
        highlight: String(entry.team?.id ?? '') === source.providerTeamId,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('provider_http_')) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('provider_timeout');
    if (error instanceof z.ZodError || error instanceof SyntaxError) throw new Error('provider_invalid_response');
    throw new Error('provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLiveMatch(
  teamId: TeamId,
  match: CanonicalMatch,
  fetchImplementation: typeof fetch = fetch,
): Promise<LiveMatchResponse> {
  const source = teamId === 'thorns' ? THORNS_SOURCES[0] : TIMBERS_SOURCES[0];
  if (!source) throw new Error('provider_source_missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const date = match.kickoff.slice(0, 10).replaceAll('-', '');
    const response = await fetchImplementation(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${source.leaguePath}/scoreboard?dates=${date}`,
      { headers: { accept: 'application/json' }, signal: controller.signal },
    );
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const payload = await response.json() as { events?: unknown[] };
    const event = (payload.events ?? []).find((candidate) => String((candidate as { id?: unknown })?.id) === match.providerEventId) as Record<string, unknown> | undefined;
    if (!event) throw new Error('provider_event_missing');
    const competition = (event.competitions as Array<Record<string, unknown>> | undefined)?.[0];
    const competitors = (competition?.competitors as Array<Record<string, unknown>> | undefined) ?? [];
    const home = competitors.find((candidate) => candidate.homeAway === 'home');
    const away = competitors.find((candidate) => candidate.homeAway === 'away');
    const homeScore = Math.max(0, Number(home?.score ?? 0));
    const awayScore = Math.max(0, Number(away?.score ?? 0));
    const events = ((competition?.details as Array<Record<string, unknown>> | undefined) ?? []).map((detail, index) => {
      const team = detail.team as Record<string, unknown> | undefined;
      const athlete = detail.athlete as Record<string, unknown> | undefined;
      const text = String(detail.text ?? detail.description ?? 'Match event');
      return {
        id: String(detail.id ?? `${match.providerEventId}-${index}`),
        type: /goal/i.test(text) ? 'goal' : /period|half|start|end/i.test(text) ? 'period' : 'other',
        minute: eventMinute(detail.clock),
        teamId: team?.id === source.providerTeamId ? teamId : null,
        player: athlete?.displayName ? String(athlete.displayName) : null,
        description: text,
        homeScore,
        awayScore,
      };
    });
    return liveMatchResponseSchema.parse({
      match: canonicalMatchSchema.parse({ ...match, status: 'live', dataUpdatedAt: new Date().toISOString() }),
      homeScore,
      awayScore,
      events,
      source: 'live',
      freshness: 'fresh',
      dataUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('provider_http_')) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('provider_timeout');
    if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === 'provider_event_missing')) throw new Error('provider_invalid_response');
    throw new Error('provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

function eventMinute(value: unknown): number | null {
  if (typeof value === 'object' && value !== null) {
    const displayValue = (value as { displayValue?: unknown }).displayValue;
    const parsed = Number(displayValue);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

type StandingEntry = {
  team?: { id?: unknown; displayName?: unknown; name?: unknown };
  stats?: unknown[];
  group: string | null;
  indexInGroup: number;
};

// ESPN groups standings under top-level "children" (e.g. MLS's Eastern/Western
// conferences). A league with a single child (e.g. NWSL) has no meaningful split,
// so its entries are left ungrouped rather than labeled with the season name.
function extractStandingEntries(payload: unknown): StandingEntry[] {
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const children = (Array.isArray(record.children) ? record.children : []) as Array<Record<string, unknown>>;
  const groups = children.filter((child) => {
    const standings = child.standings as Record<string, unknown> | undefined;
    return Array.isArray(standings?.entries);
  });
  const multipleGroups = groups.length > 1;
  const result: StandingEntry[] = [];
  for (const child of groups) {
    const groupName = multipleGroups ? (String(child.name ?? child.abbreviation ?? '').trim() || null) : null;
    const entries = (child.standings as Record<string, unknown>).entries as unknown[];
    entries.forEach((entry, indexInGroup) => {
      if (entry && typeof entry === 'object') {
        result.push({ ...(entry as Record<string, unknown>), group: groupName, indexInGroup } as StandingEntry);
      }
    });
  }
  return result;
}

function scheduleUrl(source: ScheduleSource, season: number): string {
  return `https://site.api.espn.com/apis/site/v2/sports/soccer/${source.leaguePath}/teams/${source.providerTeamId}/schedule?season=${season}&fixture=true`;
}

function mapMatchStatus(status: {
  state?: 'pre' | 'in' | 'post';
  completed?: boolean;
  name?: string;
} | undefined): CanonicalMatch['status'] {
  const name = status?.name?.toLowerCase() ?? '';
  if (name.includes('postpon')) return 'postponed';
  if (name.includes('cancel')) return 'cancelled';
  if (status?.completed || status?.state === 'post') return 'final';
  if (status?.state === 'in') return 'live';
  return 'scheduled';
}
