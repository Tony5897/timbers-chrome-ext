import {
  canonicalMatchSchema,
  nextMatchResponseSchema,
  publicConfigSchema,
  teamIdSchema,
  teamSchema,
  type CanonicalMatch,
  type PublicConfig,
  type Team,
  type TeamId,
} from '@matchday/contracts';
import {
  assertScheduleAvailable,
  createPublicConfig,
  getTeam,
  listTeams,
} from '@matchday/domain';
import { MINIMUM_CLIENT_VERSION } from './domain.js';
import { fetchCanonicalMatches } from './provider.js';

type MatchFetcher = (teamId: TeamId) => Promise<CanonicalMatch[]>;

export class PublicReadService {
  constructor(
    private readonly fetchMatches: MatchFetcher = (teamId) => fetchCanonicalMatches(teamId),
    private readonly now: () => number = Date.now,
  ) {}

  getConfig(): PublicConfig {
    return publicConfigSchema.parse(
      createPublicConfig(new Date(this.now()), MINIMUM_CLIENT_VERSION),
    );
  }

  listTeams(): Team[] {
    return listTeams().map((team) => teamSchema.parse(team));
  }

  getTeam(value: unknown): Team {
    try {
      return teamSchema.parse(getTeam(teamIdSchema.parse(value)));
    } catch (error) {
      if (error instanceof Error && error.message === 'team_not_found') throw error;
      throw new Error('team_not_found');
    }
  }

  async getNextMatch(value: unknown): Promise<{ match: CanonicalMatch }> {
    const team = this.getTeam(value);
    assertScheduleAvailable(team.id);
    const matches = await this.fetchMatches(team.id);
    const now = this.now();
    const match = matches.find((candidate) => (
      Date.parse(candidate.kickoff) > now && candidate.status === 'scheduled'
    ));
    if (!match) throw new Error('match_not_found');
    return nextMatchResponseSchema.parse({ match: canonicalMatchSchema.parse(match) });
  }
}
