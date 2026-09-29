import Link from "next/link";
export default function NotFound() {
  return (
    <main className="center-page">
      <section className="form-card">
        <h1>페이지를 찾을 수 없어요</h1>
        <Link className="button primary" href="/">
          우리 가족 앨범으로
        </Link>
      </section>
    </main>
  );
}
