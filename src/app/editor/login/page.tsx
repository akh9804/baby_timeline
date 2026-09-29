import Link from "next/link";
import { Sprout } from "lucide-react";
import { EditorLogin } from "@/features/editor-login";
export default function LoginPage() {
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
          등록된 편집자 이메일과 비밀번호로 로그인해 주세요.
          <br />
          엄마와 아빠만 기록을 남길 수 있어요.
        </p>
        <EditorLogin />
        <Link className="back-link" href="/access">
          ← 가족 비밀번호로 들어가기
        </Link>
      </section>
    </main>
  );
}
