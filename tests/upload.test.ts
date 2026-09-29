import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/shared/supabase/browser", () => ({ browserClient: mocks.client }));
import { uploadMedia, type SelectedFile } from "@/features/upload-media";
const uuid = "11111111-1111-4111-8111-111111111111";
const item: SelectedFile = {
  id: uuid,
  file: new File(["photo"], "memory.jpg", { type: "image/jpeg" }),
  width: 1,
  height: 1,
  duration: null,
  capturedAt: "",
};
function setup(
  options: {
    duplicate?: boolean;
    insertFailed?: boolean;
    committed?: boolean;
    uncertain?: boolean;
  } = {},
) {
  const lookup = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValue({
      data: options.committed ? { id: uuid } : null,
      error: options.uncertain ? new Error("offline") : null,
    });
  const insert = vi
    .fn()
    .mockResolvedValue({
      error: options.insertFailed ? new Error("insert failed") : null,
    });
  const upload = vi
    .fn()
    .mockResolvedValue({
      error: options.duplicate ? { statusCode: "409" } : null,
    });
  const remove = vi.fn().mockResolvedValue({ error: null });
  mocks.client.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: lookup }) }),
      insert,
    }),
    storage: { from: () => ({ upload, remove }) },
  });
  return { insert, upload, remove };
}
beforeEach(() => vi.resetAllMocks());
describe("upload compensation and retry", () => {
  it("removes the storage object after confirmed metadata failure", async () => {
    const { remove } = setup({ insertFailed: true });
    await expect(uploadMedia(uuid, uuid, item, 0)).rejects.toThrow(
      "저장하지 못했어요",
    );
    expect(remove).toHaveBeenCalledWith([
      `children/${uuid}/moments/${uuid}/${uuid}.jpg`,
    ]);
  });
  it("does not delete a file when the insert committed but its response was lost", async () => {
    const { remove } = setup({ insertFailed: true, committed: true });
    await expect(uploadMedia(uuid, uuid, item, 0)).resolves.toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });
  it("keeps the file if the database outcome cannot be established", async () => {
    const { remove } = setup({ insertFailed: true, uncertain: true });
    await expect(uploadMedia(uuid, uuid, item, 0)).rejects.toThrow(
      "저장 상태를 확인하지 못했어요",
    );
    expect(remove).not.toHaveBeenCalled();
  });
  it("continues metadata insert on a retry of the same UUID upload", async () => {
    const { insert } = setup({ duplicate: true });
    await uploadMedia(uuid, uuid, item, 0);
    expect(insert).toHaveBeenCalledOnce();
  });
});
