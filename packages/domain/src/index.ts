import {
  confidencePollSchema,
  matchIdSchema,
  pollIdSchema,
  publicConfigSchema,
  teamIdSchema,
  teamSchema,
  type CanonicalMatch,
  type ConfidencePoll,
  type PublicConfig,
  type Team,
  type TeamId,
} from '@matchday/contracts';

export const CONFIDENCE_POLL_VERSION = 1;
export const POLL_OPEN_LEAD_MS = 72 * 60 * 60 * 1000;

const teams = [
  teamSchema.parse({
    id: 'timbers',
    name: 'Portland Timbers',
    shortName: 'Timbers',
    status: 'active',
    competitions: ['mls', 'leagues-cup'],
    officialUrl: 'https://www.timbers.com/',
    capabilities: {
      schedule: true,
      polling: true,
      standings: false,
      liveEvents: false,
      lineups: false,
      notifications: false,
    },
  }),
  teamSchema.parse({
    id: 'thorns',
    name: 'Portland Thorns FC',
    shortName: 'Thorns',
    status: 'planned',
    competitions: ['nwsl'],
    officialUrl: 'https://www.thorns.com/',
    capabilities: {
      schedule: false,
      polling: false,
      standings: false,
      liveEvents: false,
      lineups: false,
      notifications: false,
    },
  }),
] satisfies Team[];

export function listTeams(): Team[] {
  return teams.map((team) => teamSchema.parse(team));
}

export function getTeam(value: unknown): Team {
  const teamId = teamIdSchema.parse(value);
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error('team_not_found');
  return teamSchema.parse(team);
}

export function createPublicConfig(generatedAt: Date, minimumClientVersion: string): PublicConfig {
  return publicConfigSchema.parse({
    apiVersion: 'v1',
    generatedAt: generatedAt.toISOString(),
    minimumClientVersion,
    teams: listTeams(),
    features: {
      canonicalMatches: true,
      canonicalPolls: true,
      multiTeamSelection: false,
      liveEvents: false,
      notifications: false,
    },
  });
}

export function matchIdForProvider(provider: 'espn', providerEventId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(providerEventId)) throw new Error('invalid_provider_event_id');
  return `${provider}-${providerEventId}`;
}

export function confidencePollIdForMatch(matchId: string): string {
  return pollIdSchema.parse(`poll-${matchIdSchema.parse(matchId)}-confidence-v1`);
}

export function matchIdFromConfidencePollId(pollId: string): string {
  const parsedPollId = pollIdSchema.parse(pollId);
  const match = /^poll-(.+)-confidence-v1$/.exec(parsedPollId);
  if (!match?.[1]) throw new Error('invalid_poll_id');
  return matchIdSchema.parse(match[1]);
}

export function providerReferenceForMatchId(matchId: string): {
  provider: 'espn';
  providerEventId: string;
} {
  const parsedMatchId = matchIdSchema.parse(matchId);
  const match = /^([a-z0-9]+)-(.+)$/.exec(parsedMatchId);
  if (!match?.[1] || !match[2] || match[1] !== 'espn') throw new Error('unsupported_match_provider');
  return { provider: 'espn', providerEventId: match[2] };
}

export function confidencePollForMatch(
  match: Pick<CanonicalMatch, 'id' | 'teamId' | 'kickoff' | 'status'>,
  nowMs: number,
): ConfidencePoll {
  const closesAtMs = Date.parse(match.kickoff);
  return confidencePollForWindow({
    matchId: match.id,
    teamId: match.teamId,
    opensAtMs: closesAtMs - POLL_OPEN_LEAD_MS,
    closesAtMs,
    matchStatus: match.status,
  }, nowMs);
}

export function confidencePollForWindow(input: {
  matchId: string;
  teamId: TeamId;
  opensAtMs: number;
  closesAtMs: number;
  matchStatus?: CanonicalMatch['status'];
}, nowMs: number): ConfidencePoll {
  let state: ConfidencePoll['state'];
  if (input.matchStatus === 'postponed' || input.matchStatus === 'cancelled') state = 'void';
  else if (nowMs < input.opensAtMs) state = 'scheduled';
  else if (nowMs < input.closesAtMs) state = 'open';
  else state = 'closed';

  return confidencePollSchema.parse({
    id: confidencePollIdForMatch(input.matchId),
    matchId: input.matchId,
    teamId: input.teamId,
    kind: 'confidence',
    version: CONFIDENCE_POLL_VERSION,
    state,
    opensAt: new Date(input.opensAtMs).toISOString(),
    closesAt: new Date(input.closesAtMs).toISOString(),
  });
}

export function assertScheduleAvailable(teamId: TeamId): Team {
  const team = getTeam(teamId);
  if (!team.capabilities.schedule) throw new Error('capability_unavailable');
  return team;
}

export function assertPollingAvailable(teamId: TeamId): Team {
  const team = getTeam(teamId);
  if (!team.capabilities.polling) throw new Error('capability_unavailable');
  return team;
}
