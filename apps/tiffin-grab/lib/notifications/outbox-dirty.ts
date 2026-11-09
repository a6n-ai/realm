import { onCommit } from "@/db/client";

// Enqueue helpers call this inside their db.transaction; the outbox consumer is woken once it commits.
const signal = async () => (await import("./outbox-signal")).signalOutbox();

export const markOutboxDirty = (): void => onCommit(signal);
