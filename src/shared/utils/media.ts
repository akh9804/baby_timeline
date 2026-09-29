export const BUCKET = "family-media";
export const MAX_FILE_SIZE = 500 * 1024 * 1024;
export const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
export function validateFile(file: Pick<File, "type" | "size">) {
  if (!MIME_EXTENSIONS[file.type])
    throw new Error(
      "JPG, PNG, WebP, GIF, MP4, MOV, WebM 파일만 업로드할 수 있어요.",
    );
  if (file.size <= 0 || file.size > MAX_FILE_SIZE)
    throw new Error("파일 크기는 0보다 크고 500MB 이하여야 해요.");
}
export function storagePath(
  childId: string,
  momentId: string,
  mediaId: string,
  mime: string,
) {
  if (
    ![childId, momentId, mediaId].every((id) => /^[0-9a-f-]{36}$/i.test(id)) ||
    !MIME_EXTENSIONS[mime]
  )
    throw new Error("잘못된 파일 경로입니다.");
  return `children/${childId}/moments/${momentId}/${mediaId}.${MIME_EXTENSIONS[mime]}`;
}
