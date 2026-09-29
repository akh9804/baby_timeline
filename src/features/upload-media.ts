import exifr from "exifr";
import { browserClient } from "@/shared/supabase/browser";
import { BUCKET, validateFile, storagePath } from "@/shared/utils/media";
export type SelectedFile = {
  id: string;
  file: File;
  capturedAt: string;
  width: number | null;
  height: number | null;
  duration: number | null;
};
export async function inspectFile(file: File): Promise<SelectedFile> {
  validateFile(file);
  let width: number | null = null,
    height: number | null = null,
    duration: number | null = null,
    capturedAt = "";
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = url;
      await img.decode();
      width = img.naturalWidth;
      height = img.naturalHeight;
      try {
        const exif = await exifr.parse(file, ["DateTimeOriginal"]);
        if (
          exif?.DateTimeOriginal instanceof Date &&
          !isNaN(exif.DateTimeOriginal.getTime())
        ) {
          const date = exif.DateTimeOriginal;
          capturedAt = new Date(
            date.getTime() - date.getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16);
        }
      } catch {
        /* EXIF is optional. */
      }
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("metadata timeout")),
            10000,
          );
          video.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(new Error("unsupported codec"));
          };
          video.src = url;
        });
        width = video.videoWidth || null;
        height = video.videoHeight || null;
        duration = Number.isFinite(video.duration) ? video.duration : null;
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    }
  } catch {
    /* Original formats/codecs may not be decodable on this browser. */
  } finally {
    URL.revokeObjectURL(url);
  }
  return { id: crypto.randomUUID(), file, width, height, duration, capturedAt };
}
export async function uploadMedia(
  childId: string,
  momentId: string,
  item: SelectedFile,
  order: number,
) {
  const db = browserClient();
  const path = storagePath(childId, momentId, item.id, item.file.type);
  // Makes a retry after an uncertain network response idempotent.
  const { data: existing, error: lookupError } = await db
    .from("media")
    .select("id")
    .eq("id", item.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, item.file, {
      upsert: false,
      contentType: item.file.type,
      cacheControl: "600",
    });
  // A previous upload may have succeeded even when its response was lost.
  // This UUID belongs to this selected File, so a duplicate can proceed to metadata insert.
  if (
    uploadError &&
    !("statusCode" in uploadError && String(uploadError.statusCode) === "409")
  )
    throw new Error(
      `${item.file.name}: 업로드하지 못했어요. ${uploadError.message}`,
    );
  const { error } = await db.from("media").insert({
    id: item.id,
    moment_id: momentId,
    storage_path: path,
    type: item.file.type.startsWith("image/") ? "image" : "video",
    file_name: item.file.name,
    mime_type: item.file.type,
    file_size: item.file.size,
    width: item.width,
    height: item.height,
    duration_seconds: item.duration,
    captured_at: item.capturedAt
      ? new Date(item.capturedAt).toISOString()
      : null,
    sort_order: order,
  });
  if (error) {
    // A lost response does not prove the insert failed. Do not remove a committed file.
    const check = await db
      .from("media")
      .select("id")
      .eq("id", item.id)
      .maybeSingle();
    if (check.data) return;
    if (check.error)
      throw new Error(
        `${item.file.name}: 저장 상태를 확인하지 못했어요. 연결 후 다시 저장해 주세요.`,
      );
    const cleanup = await db.storage.from(BUCKET).remove([path]);
    throw new Error(
      cleanup.error
        ? `${item.file.name}: 저장과 파일 정리에 실패했어요. 관리자 확인이 필요해요.`
        : `${item.file.name}: 저장하지 못했어요. 다시 시도해 주세요.`,
    );
  }
}
