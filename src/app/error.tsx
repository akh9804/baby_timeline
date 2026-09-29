"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center-page">
      <section className="form-card">
        <h1>잠시 연결이 어려워요</h1>
        <p>서비스 설정과 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <button className="button primary" onClick={reset}>
          다시 시도
        </button>
      </section>
    </main>
  );
}
