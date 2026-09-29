import Link from "next/link";
import { Sprout, LockKeyhole, Sparkles } from "lucide-react";
import { AccessForm } from "@/features/access-form";
export default function AccessPage() {
  return (
    <main className="access-shell">
      <section className="access-story">
        <Link href="/" className="brand">
          <Sprout size={25} />
          작은 날들<span>BABY TIMELINE</span>
        </Link>
        <div className="story-copy">
          <span className="eyebrow">OUR LITTLE FAMILY ARCHIVE</span>
          <h1>
            너의 모든 처음을,
            <br />
            우리의 오래된 기억으로.
          </h1>
          <p>
            처음 만난 작은 심장 소리부터
            <br />
            하루하루 자라나는 너의 세상까지.
            <br />
            우리 가족의 소중한 순간을 차곡차곡 담아요.
          </p>
          <div className="keepsake" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="moon" />
            <Sparkles className="star star-one" />
            <Sparkles className="star star-two" />
            <span>little days, lasting memories</span>
          </div>
        </div>
        <p className="story-footer">
          가장 작은 순간이, 가장 큰 추억이 되는 곳.
        </p>
      </section>
      <section className="access-panel">
        <div className="access-card">
          <div className="icon-box">
            <LockKeyhole size={23} />
          </div>
          <span className="eyebrow">JUST FOR OUR FAMILY</span>
          <h2>우리 가족의 기록</h2>
          <p className="muted">가족 비밀번호로 소중한 날들을 만나보세요.</p>
          <AccessForm />
          <div className="private-note">
            <LockKeyhole size={13} />이 공간은 우리 가족에게만 열려 있어요.
          </div>
          <div className="editor-link">
            기록을 남기는 엄마, 아빠라면{" "}
            <Link href="/editor/login">편집자 로그인 →</Link>
          </div>
        </div>
        <span className="panel-footer">
          작은 날들 · 함께 기억하는 성장의 순간
        </span>
      </section>
    </main>
  );
}
