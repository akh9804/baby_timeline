import { redirect } from "next/navigation";
import { currentAccess } from "@/shared/auth/authorization";
import { Header } from "@/features/header";
import { TimelineView } from "@/features/timeline-view";
export default async function TimelinePage() {
  const access = await currentAccess();
  if (!access.authenticated) redirect("/access");
  return (
    <>
      <Header editor={access.editor} />
      <TimelineView editor={access.editor} />
    </>
  );
}
