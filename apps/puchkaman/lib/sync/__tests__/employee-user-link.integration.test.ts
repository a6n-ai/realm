import type { CloverApiClient, CloverEmployee } from "@realm/clover";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { employees, users } from "@/db/schema";
import { cloverEmployeesSyncService } from "@/lib/sync/clover-employees-sync.service";
import { tombstoneEmail } from "@/lib/services/users.service";

const MARK = "emp-user-link";
const emails: string[] = [];
const cloverIds: string[] = [];

function fakeClient(emps: CloverEmployee[]): CloverApiClient {
  return { listAllEmployees: async () => emps } as unknown as CloverApiClient;
}

afterEach(async () => {
  if (cloverIds.length) {
    await db.delete(employees).where(inArray(employees.cloverEmployeeId, cloverIds));
  }
  if (emails.length) {
    await db.delete(users).where(inArray(users.email, emails));
  }
  cloverIds.length = 0;
  emails.length = 0;
});

describe("clover employee sync — user provisioning", () => {
  it("re-links a rehired employee to a fresh account after the old one was soft-deleted", async () => {
    const cloverId = `${MARK}-1`;
    const email = `${MARK}-cook@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    // First sync: mints and links a fresh member account.
    await cloverEmployeesSyncService.pull(
      fakeClient([{ id: cloverId, name: "Cook", email }]),
    );
    const [afterFirst] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(afterFirst?.userId).not.toBeNull();
    const firstUserId = afterFirst!.userId!;

    // Soft-delete tombstones the email, but the employee row still points at
    // the old (now unreachable) account — its user_id slot is not free.
    const publicId = "usr_test000000000000000000";
    await db
      .update(users)
      .set({ status: "deleted", email: tombstoneEmail(publicId) })
      .where(eq(users.id, firstUserId));
    emails.push(tombstoneEmail(publicId));

    // Re-sync (rehire, same clover employee id + email): must not blow up on
    // the employees.user_id unique constraint, and must mint a new account
    // rather than resurrecting the tombstoned one.
    await cloverEmployeesSyncService.pull(
      fakeClient([{ id: cloverId, name: "Cook", email }]),
    );
    const [afterSecond] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(afterSecond?.userId).not.toBeNull();
    expect(afterSecond!.userId).not.toBe(firstUserId);

    const [newUser] = await db
      .select({ role: users.role, status: users.status, email: users.email })
      .from(users)
      .where(eq(users.id, afterSecond!.userId!));
    expect(newUser).toEqual({ role: "member", status: "active", email });
  });
});
