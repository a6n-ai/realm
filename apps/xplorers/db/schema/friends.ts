import { makeFriendTables } from "@foundry/friends/schema";
import { users } from "./auth";

export const { friendships } = makeFriendTables({ users });
