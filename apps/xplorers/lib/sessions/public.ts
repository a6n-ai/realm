import {
  groupPublicClasses,
  groupSessionsByDay,
  toPublicSessionCard,
  type PublicClass,
  type PublicSessionCard,
  type SessionDayGroup,
} from "./format";
import { getAppClock } from "@/lib/services/app-settings.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

export async function loadPublicSessionCards(): Promise<{
  cards: PublicSessionCard[];
  groups: SessionDayGroup[];
  timeZone: string;
}> {
  const timeZone = await studioSessionsService.timezone();
  const now = new Date();
  const sessions = await studioSessionsService.listPublished(now);
  const cards = sessions.map((session) => toPublicSessionCard(session, timeZone));
  return { cards, groups: groupSessionsByDay(cards, timeZone, now), timeZone };
}

export async function loadPublicClasses(): Promise<PublicClass[]> {
  const [{ timezone: timeZone, currency }, classes, sessions] = await Promise.all([
    getAppClock(),
    studioSessionsService.listPublicClasses(),
    studioSessionsService.listPublished(new Date()),
  ]);
  return groupPublicClasses(classes, sessions, timeZone, currency);
}
