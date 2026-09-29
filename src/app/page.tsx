import { redirect } from "next/navigation";
import { currentAccess } from "@/shared/auth/authorization";
export default async function Home() {
  redirect((await currentAccess()).authenticated ? "/timeline" : "/access");
}
