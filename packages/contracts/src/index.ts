import { z } from 'zod';

export const teamIdSchema = z.enum(['timbers', 'thorns']);
export type TeamId = z.infer<typeof teamIdSchema>;

export const competitionIdSchema = z.enum(['mls', 'leagues-cup', 'nwsl']);
export type CompetitionId = z.infer<typeof competitionIdSchema>;

export const capabilitySchema = z.object({
  schedule: z.boolean(),
  polling: z.boolean(),
  standings: z.boolean(),
  liveEvents: z.boolean(),
  lineups: z.boolean(),
  notifications: z.boolean(),
}).strict();
export type Capability = z.infer<typeof capabilitySchema>;

export const teamSchema = z.object({
  id: teamIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  status: z.enum(['active', 'planned']),
  competitions: z.array(competitionIdSchema).min(1),
  officialUrl: z.url(),
  capabilities: capabilitySchema,
}).strict();
export type Team = z.infer<typeof teamSchema>;

export const publicConfigSchema = z.object({
  apiVersion: z.literal('v1'),
  generatedAt: z.iso.datetime({ offset: true }),
  minimumClientVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  teams: z.array(teamSchema),
  features: z.object({
    canonicalMatches: z.boolean(),
    multiTeamSelection: z.boolean(),
    liveEvents: z.boolean(),
    notifications: z.boolean(),
  }).strict(),
}).strict();
export type PublicConfig = z.infer<typeof publicConfigSchema>;

export const matchIdSchema = z.string().regex(/^[a-z0-9]+-[A-Za-z0-9_-]+$/);
export const matchStatusSchema = z.enum(['scheduled', 'live', 'final', 'postponed', 'cancelled']);

export const canonicalMatchSchema = z.object({
  id: matchIdSchema,
  teamId: teamIdSchema,
  competitionId: competitionIdSchema,
  provider: z.literal('espn_bootstrap'),
  providerEventId: z.string().min(1),
  kickoff: z.iso.datetime({ offset: true }),
  opponent: z.string().min(1),
  homeAway: z.enum(['home', 'away', 'neutral']),
  venue: z.string().min(1).nullable(),
  status: matchStatusSchema,
  dataUpdatedAt: z.iso.datetime({ offset: true }),
}).strict();
export type CanonicalMatch = z.infer<typeof canonicalMatchSchema>;

export const nextMatchResponseSchema = z.object({
  match: canonicalMatchSchema,
}).strict();

export const voteChoiceSchema = z.enum(['high', 'medium', 'low']);
export type VoteChoice = z.infer<typeof voteChoiceSchema>;

export const compatibilityResponseBodySchema = z.object({
  choice: voteChoiceSchema,
}).strict();

export const aggregateSchema = z.object({
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict().refine(
  (aggregate) => aggregate.high + aggregate.medium + aggregate.low === aggregate.total,
  { message: 'Aggregate choices must sum to total.' },
);
export type Aggregate = z.infer<typeof aggregateSchema>;

export const apiErrorSchema = z.object({
  type: z.literal('about:blank'),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: z.string().regex(/^[a-z0-9_]+$/),
  detail: z.string().min(1),
  requestId: z.uuid(),
}).strict();
export type ApiError = z.infer<typeof apiErrorSchema>;
