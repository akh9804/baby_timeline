import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyFamilySession } from "./session-token";
import { serverClient } from "@/shared/supabase/server";
export async function currentAccess() {
  const family = await verifyFamilySession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    process.env.FAMILY_SESSION_SECRET ?? "",
  );
  const supabase = await serverClient();
  if (!supabase) return { authenticated: family, editor: false };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authenticated: family, editor: false };
  const { data } = await supabase
    .from("editors")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { authenticated: family || !!data, editor: !!data };
}
