import { SignJWT, jwtVerify } from "jose";
export const SESSION_COOKIE = "family_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
function key(secret: string) {
  if (secret.length < 32)
    throw new Error(
      "FAMILY_SESSION_SECRET must contain at least 32 characters",
    );
  return new TextEncoder().encode(secret);
}
export async function signFamilySession(secret: string) {
  return new SignJWT({ type: "family" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("baby-timeline")
    .setAudience("family")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(key(secret));
}
export async function verifyFamilySession(
  token: string | undefined,
  secret: string,
) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: "baby-timeline",
      audience: "family",
      requiredClaims: ["iat", "exp"],
    });
    return payload.type === "family";
  } catch {
    return false;
  }
}
