import { currentAccess } from "@/shared/auth/authorization";
import { json, unavailable } from "@/shared/utils/http";
export async function GET() {
  try {
    return json(await currentAccess());
  } catch {
    return unavailable();
  }
}
