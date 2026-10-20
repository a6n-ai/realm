import {
  groupPublicClasses,
  groupSessionsByDay,
  toPublicSessionCard,
  type PublicClass,
  type PublicSessionCard,
  type SessionDayGroup,
} from "./format";
import { getAppClock, getDefaultPrices } from "@/lib/services/app-settings.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

/** Signed out goes through login first and lands on the booking page. */
export function bookHref(publicId: string, signedIn: boolean): string {
  const book = `/me/book?session=${publicId}`;
  return signedIn ? book : `/login?next=${encodeURIComponent(book)}`;
}

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
  const [{ timezone: timeZone, currency }, globalPrices, classes, sessions] = await Promise.all([
    getAppClock(),
    getDefaultPrices(),
    studioSessionsService.listPublicClasses(),
    studioSessionsService.listPublished(new Date()),
  ]);
  return groupPublicClasses(classes, sessions, timeZone, currency, globalPrices);
}
