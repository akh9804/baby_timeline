"use client";
import { navigateFresh } from "@/shared/utils/navigation";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Heart, Sprout, ArrowDown, Pencil } from "lucide-react";
import type { Timeline } from "@/entities/types";
import { ageLabel, calendarDate, displayDate } from "@/shared/utils/dates";
import { PrivateMedia } from "./private-media";
export function TimelineView({ editor }: { editor: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ["timeline"],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const r = await fetch(
        `/api/timeline${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      );
      if (r.status === 401) {
        navigateFresh("/access");
        throw new Error("가족 인증이 필요해요.");
      }
      if (!r.ok)
        throw new Error(
          "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      return r.json() as Promise<Timeline>;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const child = query.data?.pages[0].child;
  const moments = query.data?.pages.flatMap((p) => p.moments) ?? [];
  return (
    <main className="page-width timeline-page">
      <section className="timeline-intro">
        <span className="eyebrow">EVERY LITTLE MOMENT</span>
        <h1>
          {child?.name ? `${child.name}의 작은 날들` : "우리의 작은 날들"}
          <Heart size={28} />
        </h1>
        <p>매일 조금씩 자라는 너, 오래도록 기억하고 싶은 순간들.</p>
        <div className="intro-tags">
          <span>
            <Sprout size={14} />
            함께 쌓아가는 성장 기록
          </span>
          {child?.birth_date && (
            <span>{child.birth_date.replaceAll("-", ".")} 태어났어요</span>
          )}
          {!child?.birth_date && child?.due_date && (
            <span>{child.due_date.replaceAll("-", ".")} 만날 예정이에요</span>
          )}
        </div>
      </section>
      <div className="section-heading">
        <h2>우리 가족 타임라인</h2>
        <span>최근 순간부터</span>
      </div>
      {query.isPending && (
        <div className="empty-state skeleton">
          소중한 순간을 불러오고 있어요…
        </div>
      )}
      {query.isError && (
        <div className="empty-state">
          <p role="alert" className="error">
            {query.error.message}
          </p>
          <button className="button secondary" onClick={() => query.refetch()}>
            다시 시도
          </button>
        </div>
      )}
      {query.isSuccess && !moments.length && (
        <div className="empty-state">
          <div className="icon-box">
            <Sprout />
          </div>
          <h2>첫 번째 추억을 기다리고 있어요</h2>
          <p>
            {editor
              ? "작은 순간 하나로 우리 가족의 이야기를 시작해 보세요."
              : "가족이 남겨줄 소중한 순간이 곧 이곳에 쌓일 거예요."}
          </p>
          {editor && (
            <Link className="button primary" href="/upload">
              첫 기록 남기기
            </Link>
          )}
        </div>
      )}
      <div className="timeline-list">
        {moments.map((moment, i) => {
          const year = calendarDate(moment.occurred_at).slice(0, 4);
          return (
            <div key={moment.id}>
              {(i === 0 ||
                calendarDate(moments[i - 1].occurred_at).slice(0, 4) !==
                  year) && (
                <div className="year-label">
                  {year}
                  <span>OUR STORY</span>
                </div>
              )}
              <article className="moment-card">
                <div className="moment-top">
                  <span className="age-badge">
                    {child
                      ? ageLabel(moment.occurred_at, child)
                      : "소중한 하루"}
                  </span>
                  {editor && (
                    <Link
                      className="edit-link"
                      href={`/upload?moment=${moment.id}`}
                    >
                      <Pencil size={14} />
                      수정
                    </Link>
                  )}
                </div>
                <h2>{moment.title}</h2>
                {moment.description && (
                  <p className="moment-description">{moment.description}</p>
                )}
                {moment.media.length > 0 && (
                  <div
                    className={`media-grid ${moment.media.length === 1 ? "single" : ""}`}
                  >
                    {moment.media.map((media) => (
                      <PrivateMedia key={media.id} media={media} />
                    ))}
                  </div>
                )}
                <footer>
                  <time dateTime={moment.occurred_at}>
                    {displayDate(moment.occurred_at)}
                  </time>
                  <span>
                    사진 {moment.media.filter((m) => m.type === "image").length}{" "}
                    · 영상{" "}
                    {moment.media.filter((m) => m.type === "video").length}
                  </span>
                </footer>
              </article>
            </div>
          );
        })}
      </div>
      {query.hasNextPage && (
        <button
          className="button secondary load-more"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          <ArrowDown size={16} />
          {query.isFetchingNextPage ? "불러오는 중…" : "이전 순간 더 보기"}
        </button>
      )}
      <p className="album-footer">작은 날들, 오래 남을 이야기.</p>
    </main>
  );
}
