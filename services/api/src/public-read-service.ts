import {
  canonicalMatchSchema,
  liveMatchResponseSchema,
  nextMatchResponseSchema,
  publicConfigSchema,
  standingsResponseSchema,
  teamIdSchema,
  teamSchema,
  type CanonicalMatch,
  type DataSource,
  type Freshness,
  type LiveMatchResponse,
  type PublicConfig,
  type Standing,
  type StandingsResponse,
  type Team,
  type TeamId,
} from '@matchday/contracts';
import {
  assertScheduleAvailable,
  confidencePollForMatch,
  createPublicConfig,
  getTeam,
  listTeams,
} from '@matchday/domain';
import { MINIMUM_CLIENT_VERSION } from './domain.js';
import { fetchCanonicalMatches, fetchLiveMatch, fetchStandings } from './provider.js';

type MatchFetcher = (teamId: TeamId) => Promise<CanonicalMatch[]>;
type StandingsFetcher = (teamId: TeamId) => Promise<Standing[]>;
type LiveMatchFetcher = (teamId: TeamId, match: CanonicalMatch) => Promise<LiveMatchResponse>;

export class PublicReadService {
  private readonly matchCache = new Map<TeamId, { matches: CanonicalMatch[]; updatedAt: string }>();
  private readonly standingsCache = new Map<TeamId, { standings: Standing[]; updatedAt: string }>();

  constructor(
    private readonly fetchMatches: MatchFetcher = (teamId) => fetchCanonicalMatches(teamId),
    private readonly now: () => number = Date.now,
    private readonly fetchStandingsData: StandingsFetcher = (teamId) => fetchStandings(teamId),
    private readonly fetchLiveMatchData: LiveMatchFetcher = (teamId, match) => fetchLiveMatch(teamId, match),
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

  async getNextMatch(value: unknown): Promise<{
    match: CanonicalMatch;
    polls: ReturnType<typeof confidencePollForMatch>[];
    source: DataSource;
    freshness: Freshness;
  }> {
    const team = this.getTeam(value);
    assertScheduleAvailable(team.id);
    let matches: CanonicalMatch[];
    let source: 'live' | 'cache' = 'live';
    try {
      matches = await this.fetchMatches(team.id);
      this.matchCache.set(team.id, { matches, updatedAt: new Date().toISOString() });
    } catch (error) {
      const cached = this.matchCache.get(team.id);
      if (!cached) throw error;
      matches = cached.matches;
      source = 'cache';
    }
    const now = this.now();
    const match = matches.find((candidate) => candidate.status === 'live')
      ?? matches.find((candidate) => Date.parse(candidate.kickoff) > now && candidate.status === 'scheduled');
    if (!match) throw new Error('match_not_found');
    return nextMatchResponseSchema.parse({
      match: canonicalMatchSchema.parse(match),
      polls: team.capabilities.polling ? [confidencePollForMatch(match, now)] : [],
      source,
      freshness: source === 'live' ? 'fresh' : 'stale',
    });
  }

  async getStandings(value: unknown): Promise<StandingsResponse> {
    const team = this.getTeam(value);
    if (!team.capabilities.standings) throw new Error('capability_unavailable');
    try {
      const standings = await this.fetchStandingsData(team.id);
      const updatedAt = new Date().toISOString();
      this.standingsCache.set(team.id, { standings, updatedAt });
      return standingsResponseSchema.parse({ teamId: team.id, standings, source: 'live', freshness: 'fresh', dataUpdatedAt: updatedAt });
    } catch (error) {
      const cached = this.standingsCache.get(team.id);
      if (!cached) throw error;
      return standingsResponseSchema.parse({ teamId: team.id, standings: cached.standings, source: 'cache', freshness: 'stale', dataUpdatedAt: cached.updatedAt });
    }
  }

  async getLiveMatch(value: unknown): Promise<LiveMatchResponse> {
    const team = this.getTeam(value);
    if (!team.capabilities.liveEvents) throw new Error('capability_unavailable');
    const matches = await this.fetchMatches(team.id);
    const match = matches.find((candidate) => candidate.status === 'live');
    if (!match) throw new Error('match_not_found');
    return liveMatchResponseSchema.parse(await this.fetchLiveMatchData(team.id, match));
  }
}
