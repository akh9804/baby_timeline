import Link from "next/link";
import { Sprout } from "lucide-react";
import { EditorLogin } from "@/features/editor-login";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="center-page">
      <Link href="/" className="brand">
        <Sprout />
        작은 날들
      </Link>
      <section className="form-card">
        <span className="eyebrow">FOR MOM & DAD</span>
        <h1>소중한 순간을 남겨요</h1>
        <p className="muted">
          등록된 편집자 이메일로 로그인 링크를 보내드려요.
          <br />이 브라우저에서 메일의 링크를 열어 주세요.
        </p>
        <EditorLogin expired={!!params.error} />
        <Link className="back-link" href="/access">
          ← 가족 비밀번호로 들어가기
        </Link>
      </section>
    </main>
  );
}
