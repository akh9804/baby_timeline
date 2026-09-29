import "server-only";
import { z } from "zod";
import { currentAccess } from "@/shared/auth/authorization";
import { adminClient } from "@/shared/supabase/admin";
import { BUCKET } from "./media";
import { json, sameOrigin, unavailable } from "./http";
export async function deleteRecord(
  request: Request,
  id: string,
  table: "moments" | "media",
) {
  if (!sameOrigin(request))
    return json({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    if (!(await currentAccess()).editor)
      return json({ error: "편집자 권한이 필요해요." }, 403);
    if (!z.uuid().safeParse(id).success)
      return json({ error: "잘못된 기록입니다." }, 400);
    const db = adminClient();
    const result = await db.from(table).delete().eq("id", id);
    if (result.error) return unavailable();
    // Query the atomic deletion queue AFTER cascade deletion, including concurrent inserts.
    // Retrying the same DELETE also drains leftovers from an interrupted request.
    const paths = await db
      .from("storage_cleanup")
      .select("storage_path")
      .eq(table === "moments" ? "moment_id" : "media_id", id);
    if (paths.error) return json({ deleted: true, cleanupPending: true }, 202);
    const names = paths.data.map((m) => m.storage_path);
    if (names.length) {
      const removed = await db.storage.from(BUCKET).remove(names);
      if (removed.error)
        return json({ deleted: true, cleanupPending: true }, 202);
      await db.from("storage_cleanup").delete().in("storage_path", names);
    }
    return json({ deleted: true, cleanupPending: false });
  } catch {
    return unavailable();
  }
}
