export type Channel = string; // e.g. `ticket:tkt_abc`

// Role of the emitting user, so the peer can decide relevance ("is the OTHER
// side online / typing"). "staff" covers admin+member; "customer" is a user.
export type RealtimeRole = "staff" | "customer";

export type RealtimeEvent =
  | { type: "presence"; userId: string; role: RealtimeRole; online: boolean }
  | { type: "typing"; userId: string; role: RealtimeRole; typing: boolean }
  | { type: "message"; channel: string }; // live "something new" ping → peer refreshes
