import { deleteRecord } from "@/shared/utils/delete-media";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return deleteRecord(request, (await context.params).id, "media");
}
