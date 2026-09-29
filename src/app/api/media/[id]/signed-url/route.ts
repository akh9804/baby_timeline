import { z } from "zod";
import { currentAccess } from "@/shared/auth/authorization";
import { adminClient } from "@/shared/supabase/admin";
import { BUCKET } from "@/shared/utils/media";
import { json, unavailable } from "@/shared/utils/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await currentAccess()).authenticated)
      return json({ error: "가족 인증이 필요합니다." }, 401);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      return json({ error: "잘못된 미디어입니다." }, 400);
    const db = adminClient();
    const { data: media, error } = await db
      .from("media")
      .select("storage_path")
      .eq("id", id)
      .maybeSingle();
    if (error) return unavailable();
    if (!media) return json({ error: "미디어를 찾을 수 없습니다." }, 404);
    const { data, error: signError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(media.storage_path, 600);
    if (signError || !data) return unavailable();
    return json({ url: data.signedUrl, expiresIn: 600 });
  } catch {
    return unavailable();
  }
}
