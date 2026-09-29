import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/shared/auth/session-token";
import { json, sameOrigin, unavailable } from "@/shared/utils/http";
import { serverClient } from "@/shared/supabase/server";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const client = await serverClient();
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) return unavailable();
    }
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return unavailable();
  }
}
