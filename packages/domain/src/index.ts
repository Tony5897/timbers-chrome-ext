import {
  publicConfigSchema,
  teamIdSchema,
  teamSchema,
  type PublicConfig,
  type Team,
  type TeamId,
} from '@matchday/contracts';

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

export function assertScheduleAvailable(teamId: TeamId): Team {
  const team = getTeam(teamId);
  if (!team.capabilities.schedule) throw new Error('capability_unavailable');
  return team;
}
