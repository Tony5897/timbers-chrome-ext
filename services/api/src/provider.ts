import {
  canonicalMatchSchema,
  type CanonicalMatch,
  type CompetitionId,
  type TeamId,
} from '@matchday/contracts';
import { matchIdForProvider } from '@matchday/domain';
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
  if (teamId !== 'timbers') throw new Error('capability_unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const season = now.getUTCFullYear();

  try {
    const responses = await Promise.all(TIMBERS_SOURCES.map((source) => fetchImplementation(
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
      const source = TIMBERS_SOURCES[index];
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
  const matches = await fetchCanonicalMatches('timbers', fetchImplementation, now);
  return matches.map((match) => {
    const matchTimestamp = Date.parse(match.kickoff);
    return {
      pollId: pollIdForTimestamp(matchTimestamp),
      matchTimestamp,
      providerEventId: match.providerEventId,
      opensAtMs: matchTimestamp - POLL_OPEN_LEAD_MS,
      closesAtMs: matchTimestamp,
    };
  });
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
