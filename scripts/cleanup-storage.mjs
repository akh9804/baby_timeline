import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);
let count = 0;
for (;;) {
  const { data, error } = await db
    .from("storage_cleanup")
    .select("storage_path")
    .order("created_at")
    .limit(100);
  if (error) throw error;
  if (!data.length) break;
  const paths = data.map((x) => x.storage_path);
  const removed = await db.storage.from("family-media").remove(paths);
  if (removed.error) throw removed.error;
  const cleared = await db
    .from("storage_cleanup")
    .delete()
    .in("storage_path", paths);
  if (cleared.error) throw cleared.error;
  count += paths.length;
}
console.log(`대기 중인 원본 파일 ${count}개 정리 완료`);
