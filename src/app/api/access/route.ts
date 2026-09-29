import { compare } from "bcryptjs";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/shared/supabase/admin";
import { json, sameOrigin, unavailable } from "@/shared/utils/http";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  signFamilySession,
} from "@/shared/auth/session-token";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const input = z
      .object({ password: z.string().min(1).max(72) })
      .safeParse(await request.json());
    if (!input.success || Buffer.byteLength(input.data.password) > 72)
      return json({ error: "비밀번호를 확인해 주세요." }, 400);
    const secret = process.env.FAMILY_SESSION_SECRET;
    const hash = process.env.FAMILY_PASSWORD_HASH;
    const secondHash = process.env.FAMILY_PASSWORD_HASH_2;
    if (!secret || secret.length < 32 || !hash) {
      console.error("Family access is not configured: FAMILY_SESSION_SECRET or FAMILY_PASSWORD_HASH is missing/invalid");
      return unavailable();
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const fingerprint = createHmac("sha256", secret).update(ip).digest("hex");
    const { data: allowed, error } = await adminClient().rpc(
      "consume_access_attempt",
      { fingerprint },
    );
    if (error) {
      console.error("Family access rate limiter RPC failed:", error.message);
      return unavailable();
    }
    if (!allowed)
      return json(
        { error: "시도가 너무 많아요. 15분 후 다시 시도해 주세요." },
        429,
      );
    // Check all configured hashes; both passwords grant the same family session.
    const matches = await Promise.all(
      [hash, secondHash]
        .filter((value): value is string => !!value)
        .map((value) => compare(input.data.password, value)),
    );
    if (!matches.some(Boolean))
      return json(
        { error: "비밀번호가 맞지 않아요. 다시 확인해 주세요." },
        401,
      );
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(SESSION_COOKIE, await signFamilySession(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch {
    return unavailable();
  }
}
