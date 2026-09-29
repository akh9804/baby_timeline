"use client";
import { navigateFresh } from "@/shared/utils/navigation";
/* eslint-disable @next/next/no-img-element -- Private original URLs must load directly from Storage. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Expand } from "lucide-react";
import { PhotoViewer } from "./photo-viewer";
import type { Media } from "@/entities/types";
export function PrivateMedia({ media }: { media: Media }) {
  const ref = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "300px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const query = useQuery({
    queryKey: ["media-url", media.id],
    enabled: visible || opened,
    queryFn: async () => {
      const response = await fetch(`/api/media/${media.id}/signed-url`);
      if (response.status === 401) navigateFresh("/access");
      if (!response.ok) throw new Error("미디어를 불러오지 못했어요.");
      return response.json() as Promise<{ url: string }>;
    },
    staleTime: 8 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: visible || opened ? 8 * 60 * 1000 : false,
  });
  return (
    <div ref={ref} className="media-item">
      {query.isError || failed ? (
        <div className="media-placeholder">
          <p>미디어를 불러오지 못했어요.</p>
          <button
            type="button"
            className="button secondary small"
            onClick={() => {
              setFailed(false);
              void query.refetch();
            }}
          >
            다시 불러오기
          </button>
        </div>
      ) : query.data ? (
        media.type === "video" ? (
          <video
            src={query.data.url}
            controls
            preload="metadata"
            playsInline
            onError={() => setFailed(true)}
            aria-label={media.file_name ?? "가족 영상"}
          />
        ) : (
          <button
            type="button"
            className="photo-open"
            aria-label={`${media.file_name ?? "가족 사진"} 크게 보기`}
            onClick={() => setOpened(true)}
          >
            <img
              src={query.data.url}
              alt={media.file_name ?? "가족 사진"}
              loading="lazy"
              onError={() => setFailed(true)}
            />
            <span className="photo-open-hint" aria-hidden="true">
              <Expand size={16} />
              크게 보기
            </span>
          </button>
        )
      ) : (
        <div className="media-placeholder skeleton">추억을 불러오는 중…</div>
      )}
      {opened && query.data && (
        <PhotoViewer
          url={query.data.url}
          name={media.file_name ?? "가족 사진"}
          onClose={() => setOpened(false)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
