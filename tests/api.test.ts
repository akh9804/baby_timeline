import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  compare: vi.fn(),
}));
vi.mock("@/shared/auth/authorization", () => ({ currentAccess: mocks.access }));
vi.mock("@/shared/supabase/admin", () => ({ adminClient: mocks.admin }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
import { GET as signedUrl } from "@/app/api/media/[id]/signed-url/route";
import { GET as timeline } from "@/app/api/timeline/route";
import { DELETE as deleteMoment } from "@/app/api/moments/[id]/route";
import { POST as login } from "@/app/api/access/route";
const id = "55555555-5555-4555-8555-555555555555";
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ authenticated: false, editor: false });
});
describe("BFF authorization", () => {
  it("rejects guest timeline and media requests before using the privileged client", async () => {
    expect(
      (await timeline(new Request("http://localhost/api/timeline"))).status,
    ).toBe(401);
    expect(
      (await signedUrl(new Request("http://localhost/api/media/url"), context))
        .status,
    ).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not grant mutations to family viewers", async () => {
    mocks.access.mockResolvedValue({ authenticated: true, editor: false });
    const r = await deleteMoment(
      new Request("http://localhost/api/moments/" + id, {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      context,
    );
    expect(r.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("signs only the DB path, never a client-supplied path", async () => {
    mocks.access.mockResolvedValue({ authenticated: true, editor: false });
    const sign = vi
      .fn()
      .mockResolvedValue({
        data: { signedUrl: "https://storage.example/private-token" },
        error: null,
      });
    const lookup = vi
      .fn()
      .mockResolvedValue({
        data: { storage_path: "trusted/db/path.jpg" },
        error: null,
      });
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
      storage: { from: () => ({ createSignedUrl: sign }) },
    });
    const r = await signedUrl(
      new Request(
        "http://localhost/api/media/" +
          id +
          "/signed-url?path=another-family.jpg",
      ),
      context,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(sign).toHaveBeenCalledWith("trusted/db/path.jpg", 600);
    expect(await r.json()).toEqual({
      url: "https://storage.example/private-token",
      expiresIn: 600,
    });
  });
  it("blocks forged origins before password verification or deletion", async () => {
    expect(
      (
        await login(
          new Request("http://localhost/api/access", {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await deleteMoment(
          new Request("http://localhost/api/moments/" + id, {
            method: "DELETE",
            headers: { origin: "https://evil.example" },
          }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("sets a secure HttpOnly 30-day cookie after successful authentication", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FAMILY_SESSION_SECRET", "x".repeat(64));
    vi.stubEnv("FAMILY_PASSWORD_HASH", "hash");
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    });
    mocks.compare.mockResolvedValue(true);
    try {
      const r = await login(
        new Request("http://localhost/api/access", {
          method: "POST",
          headers: { origin: "http://localhost" },
          body: JSON.stringify({ password: "test-password" }),
        }),
      );
      expect(r.status).toBe(204);
      const cookie = r.headers.get("set-cookie")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=lax");
      expect(cookie).toContain("Max-Age=2592000");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("fails closed if the persistent limiter is unavailable", async () => {
    vi.stubEnv("FAMILY_SESSION_SECRET", "x".repeat(64));
    vi.stubEnv("FAMILY_PASSWORD_HASH", "hash");
    mocks.admin.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("offline") }),
    });
    try {
      const r = await login(
        new Request("http://localhost/api/access", {
          method: "POST",
          headers: { origin: "http://localhost" },
          body: JSON.stringify({ password: "test-password" }),
        }),
      );
      expect(r.status).toBe(503);
      expect(r.headers.get("set-cookie")).toBeNull();
      expect(mocks.compare).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
