import { createFriendsService } from "@foundry/friends";
import { db } from "@/db/client";
import { friendships, users } from "@/db/schema";

export const friendsService = createFriendsService({
  db,
  users,
  friendships,
  inviteSecret: () => process.env.BETTER_AUTH_SECRET,
});
