import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hash } from "bcryptjs";
import { verifyFamilySession } from "@/shared/auth/session-token";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/supabase/admin", () => ({
  adminClient: () => ({ rpc: mocks.rpc }),
}));
import { POST } from "@/app/api/access/route";
const secret = "family-password-test-secret-".repeat(3);
let firstHash: string;
let secondHash: string;
beforeAll(async () => {
  [firstHash, secondHash] = await Promise.all([
    hash("first-family-password", 4),
    hash("second-family-password", 4),
  ]);
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubEnv("FAMILY_SESSION_SECRET", secret);
  vi.stubEnv("FAMILY_PASSWORD_HASH", firstHash);
  vi.stubEnv("FAMILY_PASSWORD_HASH_2", secondHash);
});
afterEach(() => vi.unstubAllEnvs());
function login(password: string) {
  return POST(
    new Request("http://localhost/api/access", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({ password }),
    }),
  );
}
describe("two family passwords with real bcrypt verification", () => {
  it.each(["first-family-password", "second-family-password"])(
    "issues the same family access for %s",
    async (password) => {
      const response = await login(password);
      expect(response.status).toBe(204);
      const token = response.headers
        .get("set-cookie")
        ?.match(/family_session=([^;]+)/)?.[1];
      expect(await verifyFamilySession(token, secret)).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledOnce();
    },
  );
  it("rejects passwords that match neither hash", async () => {
    const response = await login("wrong-password");
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it.each([undefined, ""])(
    "keeps single-password compatibility when second hash is %s",
    async (value) => {
      vi.stubEnv("FAMILY_PASSWORD_HASH_2", value);
      expect((await login("first-family-password")).status).toBe(204);
      expect((await login("second-family-password")).status).toBe(401);
    },
  );
  it("still requires the original password configuration", async () => {
    vi.stubEnv("FAMILY_PASSWORD_HASH", "");
    const response = await login("second-family-password");
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("applies the shared rate limit to the second password too", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await login("second-family-password");
    expect(response.status).toBe(429);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
