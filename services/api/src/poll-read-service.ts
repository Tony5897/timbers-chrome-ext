import {
  pollAggregateResponseSchema,
  pollIdSchema,
  type PollAggregateResponse,
} from '@matchday/contracts';
import {
  assertPollingAvailable,
  confidencePollForWindow,
} from '@matchday/domain';
import type { CompatibilityPollService } from './service.js';

export class PollReadService {
  constructor(
    private readonly compatibilityService: CompatibilityPollService,
    private readonly now: () => number = Date.now,
  ) {}

  async getAggregate(value: unknown): Promise<PollAggregateResponse> {
    const pollId = parsePollId(value);
    const result = await this.compatibilityService.getCanonicalAggregateResult(pollId);
    const generatedAtMs = this.now();
    assertPollingAvailable(result.window.teamId);
    const poll = confidencePollForWindow({
      matchId: result.window.matchId,
      teamId: result.window.teamId,
      opensAtMs: result.window.opensAtMs,
      closesAtMs: result.window.closesAtMs,
      matchStatus: result.window.matchStatus,
    }, generatedAtMs);

    return pollAggregateResponseSchema.parse({
      poll,
      identityClass: 'integrity_controlled',
      acceptedResponses: result.aggregate.total,
      choices: result.aggregate,
      generatedAt: new Date(generatedAtMs).toISOString(),
    });
  }
}

function parsePollId(value: unknown): string {
  const result = pollIdSchema.safeParse(value);
  if (!result.success) throw new Error('poll_not_found');
  return result.data;
}
