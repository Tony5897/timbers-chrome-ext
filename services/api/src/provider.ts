import { z } from 'zod';
import { POLL_OPEN_LEAD_MS, pollIdForTimestamp, type PollWindow } from './domain.js';

const ESPN_TEAM_ID = '9723';
const ESPN_SCHEDULE_URLS = [
  `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/${ESPN_TEAM_ID}/schedule`,
  `https://site.api.espn.com/apis/site/v2/sports/soccer/concacaf.leagues.cup/teams/${ESPN_TEAM_ID}/schedule`,
];

const eventSchema = z.object({
  id: z.string().min(1),
  date: z.iso.datetime({ offset: true }),
}).passthrough();

const scheduleSchema = z.object({
  events: z.array(eventSchema),
}).passthrough();

export type CompatibilityTeamId = 'timbers' | 'thorns';

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

export async function fetchCompatibilityPollWindows(
  fetchImplementation: typeof fetch = fetch,
  now = new Date(),
): Promise<PollWindow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const season = now.getUTCFullYear();

  try {
    const responses = await Promise.all(ESPN_SCHEDULE_URLS.map((url) => fetchImplementation(
      `${url}?season=${season}&fixture=true`,
      {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      },
    )));
    const failedResponse = responses.find((response) => !response.ok);
    if (failedResponse) throw new Error(`provider_http_${failedResponse.status}`);

    const schedules = await Promise.all(responses.map((response) => response.json()));
    const events = schedules.flatMap((payload) => parseCompatibilitySchedule(payload, 'timbers'));
    const uniqueEvents = [...new Map(events.map((event) => [event.providerEventId, event])).values()]
      .sort((left, right) => left.kickoffMs - right.kickoffMs);
    return uniqueEvents.map((event) => {
      const matchTimestamp = event.kickoffMs;
      return {
        pollId: pollIdForTimestamp(matchTimestamp),
        matchTimestamp,
        providerEventId: event.providerEventId,
        opensAtMs: matchTimestamp - POLL_OPEN_LEAD_MS,
        closesAtMs: matchTimestamp,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}
