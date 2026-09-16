import { groupSessionsByDay, toPublicSessionCard, type PublicSessionCard, type SessionDayGroup } from "./format";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

export async function loadPublicSessionCards(): Promise<{
  cards: PublicSessionCard[];
  groups: SessionDayGroup[];
  timeZone: string;
}> {
  const timeZone = await studioSessionsService.timezone();
  const sessions = await studioSessionsService.listPublished();
  const cards = sessions.map((session) => toPublicSessionCard(session, timeZone));
  return { cards, groups: groupSessionsByDay(cards, timeZone), timeZone };
}
