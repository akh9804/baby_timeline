import { z } from "zod";
import { currentAccess } from "@/shared/auth/authorization";
import { adminClient } from "@/shared/supabase/admin";
import { json, unavailable } from "@/shared/utils/http";
export async function GET(request: Request) {
  try {
    if (!(await currentAccess()).authenticated)
      return json({ error: "가족 인증이 필요합니다." }, 401);
    const db = adminClient();
    const { data: child, error: childError } = await db
      .from("children")
      .select("id,name,due_date,birth_date")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (childError) return unavailable();
    if (!child) return json({ child: null, moments: [], nextCursor: null });
    let query = db
      .from("moments")
      .select(
        "id,child_id,title,description,occurred_at,media(id,type,width,height,file_name,sort_order)",
      )
      .eq("child_id", child.id)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(21);
    const raw = new URL(request.url).searchParams.get("cursor");
    if (raw) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(raw, "base64url").toString());
      } catch {
        return json({ error: "잘못된 페이지입니다." }, 400);
      }
      const cursor = z
        .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
        .safeParse(decoded);
      if (!cursor.success) return json({ error: "잘못된 페이지입니다." }, 400);
      query = query.or(
        `occurred_at.lt.${cursor.data.at},and(occurred_at.eq.${cursor.data.at},id.lt.${cursor.data.id})`,
      );
    }
    const { data, error } = await query;
    if (error) return unavailable();
    const moments = (data ?? [])
      .slice(0, 20)
      .map((m) => ({
        ...m,
        media: m.media.sort(
          (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
        ),
      }));
    const last = moments.at(-1);
    const nextCursor =
      data.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ at: last.occurred_at, id: last.id }),
          ).toString("base64url")
        : null;
    return json({ child, moments, nextCursor });
  } catch {
    return unavailable();
  }
}
