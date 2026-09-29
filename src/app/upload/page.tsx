import { redirect } from "next/navigation";
import { currentAccess } from "@/shared/auth/authorization";
import { Header } from "@/features/header";
import { MomentEditor } from "@/features/moment-editor";
export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ moment?: string }>;
}) {
  const access = await currentAccess();
  if (!access.editor) redirect("/editor/login");
  const { moment } = await searchParams;
  return (
    <>
      <Header editor />
      <MomentEditor momentId={moment} />
    </>
  );
}
