import { NextResponse } from "next/server";
import { serverClient } from "@/shared/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const client = await serverClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/timeline", url.origin), {
        headers: { "Cache-Control": "private, no-store" },
      });
  }
  return NextResponse.redirect(
    new URL("/editor/login?error=expired", url.origin),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
