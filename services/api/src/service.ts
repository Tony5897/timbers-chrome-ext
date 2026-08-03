import {
  isSupportedClientVersion,
  type Aggregate,
  type PollWindow,
  type VoteChoice,
} from './domain.js';
import { fetchCompatibilityPollWindows } from './provider.js';
import type { CompatibilityRepository, DeletionReceipt, SubmissionResult } from './repository.js';

export class CompatibilityPollService {
  constructor(
    private readonly repository: CompatibilityRepository,
    private readonly fetchWindows: () => Promise<Awaited<ReturnType<typeof fetchCompatibilityPollWindows>>> =
      () => fetchCompatibilityPollWindows(),
    private readonly now: () => number = Date.now,
  ) {}

  async syncPollWindows(): Promise<number> {
    const windows = await this.fetchWindows();
    await this.repository.upsertPollWindows(windows);
    return windows.length;
  }

  async getAggregate(matchTimestamp: number): Promise<Aggregate> {
    return (await this.getAggregateResult(matchTimestamp)).aggregate;
  }

  async getAggregateResult(matchTimestamp: number): Promise<{
    aggregate: Aggregate;
    pollId: string;
    matchTimestamp: number;
  }> {
    const window = await this.ensureWindow(matchTimestamp);
    const aggregate = await this.repository.getAggregate(window.matchTimestamp);
    return {
      aggregate,
      pollId: window.pollId,
      matchTimestamp: window.matchTimestamp,
    };
  }

  async getCanonicalAggregateResult(canonicalPollId: string): Promise<{
    aggregate: Aggregate;
    window: PollWindow;
  }> {
    let window = await this.repository.getPollWindowByCanonicalId(canonicalPollId);
    if (!window) {
      await this.syncPollWindows();
      window = await this.repository.getPollWindowByCanonicalId(canonicalPollId);
    }
    if (!window) throw new Error('poll_not_found');
    return {
      aggregate: await this.repository.getAggregate(window.matchTimestamp),
      window,
    };
  }

  async submit(input: {
    matchTimestamp: number;
    uid: string;
    choice: VoteChoice;
    clientVersion: string;
    idempotencyKey: string;
  }): Promise<SubmissionResult & { aggregate: Aggregate }> {
    if (!isSupportedClientVersion(input.clientVersion)) {
      throw new Error('unsupported_client');
    }

    const window = await this.ensureWindow(input.matchTimestamp);
    const currentTime = this.now();
    if (currentTime < window.opensAtMs) throw new Error('poll_not_open');
    if (currentTime >= window.closesAtMs) throw new Error('poll_closed');

    const canonicalInput = { ...input, matchTimestamp: window.matchTimestamp };
    const result = await this.repository.submitResponse(canonicalInput);
    const aggregate = await this.repository.getAggregate(window.matchTimestamp);
    return { ...result, aggregate };
  }

  async deleteInstallation(uid: string): Promise<DeletionReceipt> {
    return this.repository.requestInstallationDeletion(uid);
  }

  private async ensureWindow(matchTimestamp: number) {
    let window = await this.repository.getPollWindow(matchTimestamp);
    if (window) return window;

    await this.syncPollWindows();
    window = await this.repository.getPollWindow(matchTimestamp);
    if (!window) throw new Error('poll_not_found');
    return window;
  }
}
