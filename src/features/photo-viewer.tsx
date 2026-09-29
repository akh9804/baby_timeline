"use client";
/* eslint-disable @next/next/no-img-element -- Private originals load directly from Storage. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";
export function PhotoViewer({
  url,
  name,
  onClose,
  onRetry,
}: {
  url: string;
  name: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label={`${name} 크게 보기`}
      onClose={() => {
        // Ignore a queued close event when React has already reopened the dialog.
        if (!dialog.current?.open) onClose();
      }}
    >
      <div className="photo-viewer-content">
        <header className="photo-viewer-toolbar">
          <p title={name}>{name}</p>
          <button
            type="button"
            className="viewer-button"
            aria-label={zoomed ? "사진 축소" : "사진 확대"}
            aria-pressed={zoomed}
            disabled={failed}
            onClick={() => setZoomed(!zoomed)}
          >
            {zoomed ? <ZoomOut size={23} /> : <ZoomIn size={23} />}
          </button>
          <button
            type="button"
            className="viewer-button"
            aria-label="사진 닫기"
            autoFocus
            onClick={onClose}
          >
            <X size={26} />
          </button>
        </header>
        <div className={`photo-viewer-stage${zoomed ? " is-zoomed" : ""}`}>
          {failed ? (
            <div className="viewer-error">
              <p role="alert">사진을 불러오지 못했어요.</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setFailed(false);
                  onRetry();
                }}
              >
                다시 불러오기
              </button>
            </div>
          ) : (
            <img src={url} alt={name} onError={() => setFailed(true)} />
          )}
        </div>
        <p className="photo-viewer-hint">
          {zoomed
            ? "사진을 밀어서 원하는 부분을 살펴보세요."
            : "확대 버튼으로 사진을 더 자세히 볼 수 있어요."}
        </p>
      </div>
    </dialog>,
    document.body,
  );
}
