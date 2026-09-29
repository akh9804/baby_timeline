import { NextResponse } from "next/server";
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export function unavailable() {
  return json(
    { error: "서비스 연결을 확인해 주세요. 잠시 후 다시 시도해 주세요." },
    503,
  );
}
