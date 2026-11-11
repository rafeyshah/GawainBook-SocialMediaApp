import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { invitations } from "../src/db/schema";
import { inviteProblem } from "../src/routes/circles";
import { canManageMember } from "../src/policy";
import { signUp, NONEXISTENT_UUID } from "./helpers";
import { Account, makeBook, makeCircle, makeThread, setProgress } from "./reading.helpers";

async function privateCircle() {
  const owner = await signUp();
  const book = await makeBook(10);
  const circle = await makeCircle(owner, book.id, { visibility: "private" });
  return { owner, book, circle };
}

const invite = (a: Account, circleId: string, body: Record<string, unknown> = {}) => a.client.post(`/api/circles/${circleId}/invitations`, body);
const join = (a: Account, code: string) => a.client.post("/api/circles/join", { code });

describe("inviteProblem", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const base = { expiresAt: new Date("2026-11-21T00:00:00Z"), maxUses: null as number | null, uses: 0, revokedAt: null as Date | null };
  test.each([
    ["a fresh link", base, null],
    ["an expired link", { ...base, expiresAt: new Date("2026-11-20T11:59:59Z") }, "expired"],
    ["a link expiring exactly now", { ...base, expiresAt: now }, "expired"],
    ["a used-up link", { ...base, maxUses: 2, uses: 2 }, "used"],
    ["a link with one use left", { ...base, maxUses: 2, uses: 1 }, null],
    ["a revoked link (even if fresh)", { ...base, revokedAt: now }, "revoked"],
  ])("%s", (_n, inv, expected) => expect(inviteProblem(inv, now)).toBe(expected));
});

describe("canManageMember", () => {
  test.each([
    ["owner", "moderator", "role", true],
    ["owner", "member", "remove", true],
    ["owner", "owner", "remove", false],
    ["moderator", "member", "remove", true],
    ["moderator", "moderator", "remove", false],
    ["moderator", "member", "role", false],
    ["member", "member", "remove", false],
    [null, "member", "remove", false],
    ["owner", null, "remove", false],
  ] as const)("%p → %p (%p) = %p", (actor, target, action, expected) => {
    expect(canManageMember(actor, target, action)).toBe(expected);
  });
});

describe("invite links", () => {
  test("a moderator creates a link with expiry and a use limit; it shows in the list", async () => {
    const { owner, circle } = await privateCircle();
    const res = await invite(owner, circle._id, { expiresInDays: 3, maxUses: 2 });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[\w-]{12}$/);
    expect(res.body).toMatchObject({ maxUses: 2, uses: 0 });
    const days = (new Date(res.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThanOrEqual(3);
    const list = await owner.client.get(`/api/circles/${circle._id}/invitations`);
    expect(list.body.map((i: { code: string }) => i.code)).toEqual([res.body.code]);
  });

  test("defaults: 7 days, unlimited uses", async () => {
    const { owner, circle } = await privateCircle();
    const res = await invite(owner, circle._id);
    expect(res.body.maxUses).toBeNull();
    expect(Math.round((new Date(res.body.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(7);
  });

  test.each([
    ["0 days", { expiresInDays: 0 }],
    ["31 days", { expiresInDays: 31 }],
    ["fractional days", { expiresInDays: 1.5 }],
    ["days as text", { expiresInDays: "3" }],
    ["0 uses", { maxUses: 0 }],
    ["101 uses", { maxUses: 101 }],
    ["negative uses", { maxUses: -1 }],
  ])("rejects %s", async (_n, body) => {
    const { owner, circle } = await privateCircle();
    expect((await invite(owner, circle._id, body)).status).toBe(400);
  });

  test("ordinary members can't create, list or revoke links", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id);
    const member = await signUp();
    await join(member, inv.code);
    expect((await invite(member, circle._id)).status).toBe(403);
    expect((await member.client.get(`/api/circles/${circle._id}/invitations`)).status).toBe(403);
    expect((await member.client.delete(`/api/circles/${circle._id}/invitations/${inv._id}`)).status).toBe(403);
  });

  test("outsiders get 404 (the private circle isn't revealed)", async () => {
    const { circle } = await privateCircle();
    const stranger = await signUp();
    expect((await invite(stranger, circle._id)).status).toBe(404);
    expect((await stranger.client.get(`/api/circles/${circle._id}/invitations`)).status).toBe(404);
  });

  test("preview shows the circle to someone with the code, without joining", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id);
    const guest = await signUp();
    const res = await guest.client.get(`/api/invitations/${inv.code}`);
    expect(res.status).toBe(200);
    expect(res.body.circle).toMatchObject({ _id: circle._id, name: "Test Circle", visibility: "private", memberCount: 1 });
    expect(res.body.alreadyMember).toBe(false);
    expect(res.body.circle.inviteCode).toBeUndefined();
    expect((await guest.client.get(`/api/circles/${circle._id}`)).status).toBe(404);
  });

  test("joining with a link counts a use; the last place goes to one reader only", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id, { maxUses: 1 });
    const [a, b] = await Promise.all([signUp(), signUp()]);
    const results = await Promise.all([join(a, inv.code), join(b, inv.code)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 410]);
    const [row] = await getDb().select().from(invitations).where(eq(invitations.id, inv._id));
    expect(row.uses).toBe(1);
    expect((await owner.client.get(`/api/circles/${circle._id}`)).body.memberCount).toBe(2);
  });

  test("an already-member joining again gets 409 and doesn't use up the link", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id, { maxUses: 2 });
    const a = await signUp();
    expect((await join(a, inv.code)).status).toBe(201);
    expect((await join(a, inv.code)).status).toBe(409);
    const [row] = await getDb().select().from(invitations).where(eq(invitations.id, inv._id));
    expect(row.uses).toBe(1);
    expect((await a.client.get(`/api/invitations/${inv.code}`)).body.alreadyMember).toBe(true);
  });

  test("expired links fail with 410 and a clear message, on preview and join", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id);
    await getDb().update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, inv._id));
    const a = await signUp();
    const res = await join(a, inv.code);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/expired/);
    expect((await a.client.get(`/api/invitations/${inv.code}`)).status).toBe(410);
    expect((await owner.client.get(`/api/circles/${circle._id}/invitations`)).body).toEqual([]);
  });

  test("used-up links fail with 410", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id, { maxUses: 1 });
    await join(await signUp(), inv.code);
    const res = await join(await signUp(), inv.code);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/maximum/);
  });

  test("revoked links fail; revoking twice or another circle's link is 404", async () => {
    const { owner, circle } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id);
    expect((await owner.client.delete(`/api/circles/${circle._id}/invitations/${inv._id}`)).status).toBe(200);
    expect((await owner.client.delete(`/api/circles/${circle._id}/invitations/${inv._id}`)).status).toBe(404);
    const res = await join(await signUp(), inv.code);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/turned off/);

    const other = await privateCircle();
    const { body: otherInv } = await invite(other.owner, other.circle._id);
    expect((await owner.client.delete(`/api/circles/${circle._id}/invitations/${otherInv._id}`)).status).toBe(404);
  });

  test.each([["unknown", "nope-nope-nope"], ["too short", "abc"], ["odd characters", "abc def ghi"], ["empty", ""]])(
    "%s codes are 404",
    async (_n, code) => {
      const a = await signUp();
      expect((await join(a, code)).status).toBe(404);
    }
  );

  test("the circle's permanent code still works", async () => {
    const { owner, circle } = await privateCircle();
    const code = (await owner.client.get(`/api/circles/${circle._id}`)).body.inviteCode;
    expect((await join(await signUp(), code)).status).toBe(201);
  });
});

describe("managing members", () => {
  async function circleWithMembers() {
    const { owner, circle, book } = await privateCircle();
    const { body: inv } = await invite(owner, circle._id);
    const [mod, member, other] = await Promise.all([signUp(), signUp(), signUp()]);
    for (const a of [mod, member, other]) await join(a, inv.code);
    await owner.client.put(`/api/circles/${circle._id}/members/${mod.user._id}`, { role: "moderator" });
    return { owner, mod, member, other, circle, book };
  }

  test("the owner promotes a member to moderator and back", async () => {
    const { owner, member, circle } = await circleWithMembers();
    expect((await owner.client.put(`/api/circles/${circle._id}/members/${member.user._id}`, { role: "moderator" })).body.role).toBe("moderator");
    expect((await member.client.get(`/api/circles/${circle._id}`)).body.myRole).toBe("moderator");
    await owner.client.put(`/api/circles/${circle._id}/members/${member.user._id}`, { role: "member" });
    expect((await member.client.get(`/api/circles/${circle._id}`)).body.myRole).toBe("member");
  });

  test.each([["owner"], ["admin"], [""], [undefined]])("rejects role %p", async (role) => {
    const { owner, member, circle } = await circleWithMembers();
    expect((await owner.client.put(`/api/circles/${circle._id}/members/${member.user._id}`, { role })).status).toBe(400);
  });

  test("moderators can't change roles; nobody can change the owner's", async () => {
    const { owner, mod, member, circle } = await circleWithMembers();
    expect((await mod.client.put(`/api/circles/${circle._id}/members/${member.user._id}`, { role: "moderator" })).status).toBe(403);
    expect((await mod.client.put(`/api/circles/${circle._id}/members/${owner.user._id}`, { role: "member" })).status).toBe(403);
    expect((await owner.client.put(`/api/circles/${circle._id}/members/${owner.user._id}`, { role: "member" })).status).toBe(403);
  });

  test("a moderator removes a member, who loses access immediately", async () => {
    const { owner, mod, member, circle, book } = await circleWithMembers();
    await setProgress(owner, book.id, 3);
    await setProgress(member, book.id, 3);
    const t = await makeThread(owner, circle._id, 2);
    expect((await member.client.get(`/api/threads/${t._id}`)).status).toBe(200);
    expect((await mod.client.delete(`/api/circles/${circle._id}/members/${member.user._id}`)).status).toBe(200);
    expect((await member.client.get(`/api/threads/${t._id}`)).status).toBe(404);
    expect((await member.client.get(`/api/circles/${circle._id}`)).status).toBe(404);
  });

  test("moderators can't remove other moderators or the owner; members can't remove anyone", async () => {
    const { owner, mod, member, other, circle } = await circleWithMembers();
    await owner.client.put(`/api/circles/${circle._id}/members/${other.user._id}`, { role: "moderator" });
    expect((await mod.client.delete(`/api/circles/${circle._id}/members/${other.user._id}`)).status).toBe(403);
    expect((await mod.client.delete(`/api/circles/${circle._id}/members/${owner.user._id}`)).status).toBe(403);
    expect((await member.client.delete(`/api/circles/${circle._id}/members/${mod.user._id}`)).status).toBe(403);
  });

  test("the owner can remove a moderator; removing yourself is refused (use Leave)", async () => {
    const { owner, mod, circle } = await circleWithMembers();
    expect((await owner.client.delete(`/api/circles/${circle._id}/members/${owner.user._id}`)).status).toBe(400);
    expect((await owner.client.delete(`/api/circles/${circle._id}/members/${mod.user._id}`)).status).toBe(200);
  });

  test("unknown or non-member targets are 404; strangers get 404 for the circle", async () => {
    const { owner, circle } = await circleWithMembers();
    const stranger = await signUp();
    expect((await owner.client.delete(`/api/circles/${circle._id}/members/${NONEXISTENT_UUID}`)).status).toBe(404);
    expect((await owner.client.delete(`/api/circles/${circle._id}/members/${stranger.user._id}`)).status).toBe(404);
    expect((await owner.client.delete(`/api/circles/${circle._id}/members/not-an-id`)).status).toBe(404);
    expect((await stranger.client.delete(`/api/circles/${circle._id}/members/${owner.user._id}`)).status).toBe(404);
  });
});
