import type { CloverApiClient, CloverEmployee } from "@foundry/clover";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { account, employees, users } from "@/db/schema";
import { decideSessionAdmission } from "@/lib/auth/index";
import { cloverEmployeesSyncService } from "@/lib/sync/clover-employees-sync.service";
import { tombstoneEmail } from "@/lib/services/users.service";

// Pins the "no email is ever sent" rule against a future refactor. The sync
// does not import users-invite today — mocking it is the closest seam
// available: if a later change wires inviteUser into the sync, this mock
// intercepts the call and the assertion below catches it.
vi.mock("@/lib/services/users-invite", () => ({ inviteUser: vi.fn() }));
import { inviteUser } from "@/lib/services/users-invite";

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
  vi.mocked(inviteUser).mockClear();
});

describe("clover employee sync — user provisioning", () => {
  it("creates and links a fresh member account for a new employee", async () => {
    const cloverId = `${MARK}-1`;
    const email = `${MARK}-cook@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Cook", email }]));
    const [row] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(row?.userId).not.toBeNull();

    const [newUser] = await db
      .select({ role: users.role, status: users.status, email: users.email })
      .from(users)
      .where(eq(users.id, row!.userId!));
    expect(newUser).toEqual({ role: "member", status: "inactive", email });
  });

  // /login offers email-OTP sign-in to any address, so an `active` synced row
  // would let whoever controls a Clover employee's mailbox mint a member
  // session unprompted. `inactive` is the gate, and this pins both halves: the
  // row is created inactive, and the admission check refuses it.
  it("provisions the account inactive, so it cannot obtain a session until an admin activates it", async () => {
    const cloverId = `${MARK}-7`;
    const email = `${MARK}-pending@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Pending", email }]));
    const [created] = await db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.email, email));
    expect(created!.status).toBe("inactive");
    expect(decideSessionAdmission(created!).ok).toBe(false);

    // …and once an admin activates it (the users list "Reactivate" action),
    // sign-in is allowed with no other change.
    await db.update(users).set({ status: "active" }).where(eq(users.email, email));
    const [activated] = await db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.email, email));
    expect(decideSessionAdmission(activated!).ok).toBe(true);
  });

  it("does not provision an account for an employee Clover has deleted", async () => {
    const cloverId = `${MARK}-8`;
    const email = `${MARK}-fired@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    await cloverEmployeesSyncService.pull(
      fakeClient([{ id: cloverId, name: "Fired", email, deletedTime: Date.now() }]),
    );

    const [row] = await db
      .select({ userId: employees.userId, active: employees.active })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(row!.active).toBe(false);
    expect(row!.userId).toBeNull();

    const created = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(created).toHaveLength(0);
  });

  it("leaves an existing link alone even after the linked account is soft-deleted", async () => {
    const cloverId = `${MARK}-2`;
    const email = `${MARK}-baker@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Baker", email }]));
    const [afterFirst] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    const firstUserId = afterFirst!.userId!;

    // Soft-delete tombstones the email, but the employee row still points at
    // the old (now unreachable) account.
    const publicId = "usr_test000000000000000001";
    await db
      .update(users)
      .set({ status: "deleted", email: tombstoneEmail(publicId) })
      .where(eq(users.id, firstUserId));
    emails.push(tombstoneEmail(publicId));

    // Re-sync: an employee that already has a link is never re-resolved, so
    // the (now dead) link is left exactly as it was — no second account is
    // minted, and the unique constraint on employees.user_id is never at risk.
    // The row must still persist, and the dead link must be reported, not
    // swallowed — an admin has to find out some way other than "can't log in".
    const result = await cloverEmployeesSyncService.pull(
      fakeClient([{ id: cloverId, name: "Baker", email }]),
    );
    const [afterSecond] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(afterSecond!.userId).toBe(firstUserId);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Baker");
    expect(result.errors[0]!.message).toContain("deleted");

    const usersWithEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(usersWithEmail).toHaveLength(0);
  });

  it("never re-resolves an already-linked employee, so a manual promotion to admin survives a re-sync", async () => {
    const cloverId = `${MARK}-3`;
    const email = `${MARK}-boss@example.test`;
    cloverIds.push(cloverId);
    emails.push(email);

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Boss", email }]));
    const [linked] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    const userId = linked!.userId!;
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Boss", email }]));
    const [afterResync] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(afterResync!.userId).toBe(userId);

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    expect(row!.role).toBe("admin");
  });

  it("persists both employee rows when two employees share one email, links only one, and records an error", async () => {
    const cloverIdA = `${MARK}-4a`;
    const cloverIdB = `${MARK}-4b`;
    const email = `${MARK}-shared@example.test`;
    cloverIds.push(cloverIdA, cloverIdB);
    emails.push(email);

    const result = await cloverEmployeesSyncService.pull(
      fakeClient([
        { id: cloverIdA, name: "Twin A", email },
        { id: cloverIdB, name: "Twin B", email },
      ]),
    );

    const rows = await db
      .select({ cloverEmployeeId: employees.cloverEmployeeId, userId: employees.userId })
      .from(employees)
      .where(inArray(employees.cloverEmployeeId, [cloverIdA, cloverIdB]));
    expect(rows).toHaveLength(2);

    const linkedCount = rows.filter((r) => r.userId !== null).length;
    expect(linkedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Twin B");
    expect(result.errors[0]!.message).toContain(email);

    // Only one account was ever minted for the shared email.
    const usersWithEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(usersWithEmail).toHaveLength(1);
  });

  it("keeps the old link when an already-linked employee's email changes, without minting a second account", async () => {
    const cloverId = `${MARK}-5`;
    const oldEmail = `${MARK}-old@example.test`;
    const newEmail = `${MARK}-new@example.test`;
    cloverIds.push(cloverId);
    emails.push(oldEmail, newEmail);

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Mover", email: oldEmail }]));
    const [linked] = await db
      .select({ userId: employees.userId })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    const userId = linked!.userId!;

    await cloverEmployeesSyncService.pull(fakeClient([{ id: cloverId, name: "Mover", email: newEmail }]));
    const [afterChange] = await db
      .select({ userId: employees.userId, email: employees.email })
      .from(employees)
      .where(eq(employees.cloverEmployeeId, cloverId));
    expect(afterChange!.userId).toBe(userId);
    expect(afterChange!.email).toBe(newEmail);

    const usersWithNewEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail));
    expect(usersWithNewEmail).toHaveLength(0);
  });

  it("never invites or credentials the accounts it provisions during a pull", async () => {
    const cloverIdA = `${MARK}-6a`;
    const cloverIdB = `${MARK}-6b`;
    const emailA = `${MARK}-quiet-a@example.test`;
    const emailB = `${MARK}-quiet-b@example.test`;
    cloverIds.push(cloverIdA, cloverIdB);
    emails.push(emailA, emailB);

    await cloverEmployeesSyncService.pull(
      fakeClient([
        { id: cloverIdA, name: "Quiet A", email: emailA },
        { id: cloverIdB, name: "Quiet B", email: emailB },
      ]),
    );

    expect(inviteUser).not.toHaveBeenCalled();

    const created = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, [emailA, emailB]));
    expect(created).toHaveLength(2);

    const accountRows = await db
      .select({ id: account.id })
      .from(account)
      .where(inArray(account.userId, created.map((u) => u.id)));
    expect(accountRows).toHaveLength(0);
  });
});
