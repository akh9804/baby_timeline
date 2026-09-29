import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
  signFamilySession,
  verifyFamilySession,
} from "@/shared/auth/session-token";
const secret = "a".repeat(64);
describe("signed family session", () => {
  it("accepts only a valid signature and rejects missing or modified sessions", async () => {
    const token = await signFamilySession(secret);
    expect(await verifyFamilySession(token, secret)).toBe(true);
    expect(await verifyFamilySession(undefined, secret)).toBe(false);
    expect(await verifyFamilySession(token, "b".repeat(64))).toBe(false);
    expect(await verifyFamilySession(`a${token.slice(1)}`, secret)).toBe(false);
  });
  it("rejects expired sessions and incorrect roles", async () => {
    const expired = await new SignJWT({ type: "family" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("baby-timeline")
      .setAudience("family")
      .setIssuedAt()
      .setExpirationTime("0s")
      .sign(new TextEncoder().encode(secret));
    expect(await verifyFamilySession(expired, secret)).toBe(false);
    const other = await new SignJWT({ type: "editor" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("baby-timeline")
      .setAudience("family")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    expect(await verifyFamilySession(other, secret)).toBe(false);
  });
  it("fails closed with weak configuration", async () => {
    await expect(signFamilySession("short")).rejects.toThrow();
    expect(await verifyFamilySession("anything", "")).toBe(false);
  });
});
