"use client";
import { navigateFresh } from "@/shared/utils/navigation";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sprout, Plus, LogOut, LockKeyhole } from "lucide-react";
export function Header({ editor }: { editor: boolean }) {
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/timeline">
          <Sprout size={24} />
          작은 날들<span>BABY TIMELINE</span>
        </Link>
        <nav>
          {editor ? (
            <Link className="button primary small" href="/upload">
              <Plus size={16} />
              기록 남기기
            </Link>
          ) : (
            <Link className="text-link" href="/editor/login">
              편집자 로그인
            </Link>
          )}
          <button
            className="icon-button"
            aria-label="로그아웃"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/logout", { method: "POST" });
                if (!r.ok) throw new Error();
                cache.clear();
                navigateFresh("/access");
              } catch {
                setError("로그아웃에 실패했어요. 다시 시도해 주세요.");
                setBusy(false);
              }
            }}
          >
            <LogOut size={18} />
          </button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="error page-width">
          {error}
        </p>
      )}
      <div className="privacy-line">
        <LockKeyhole size={12} />
        우리 가족만 함께 보는 비공개 앨범
      </div>
    </>
  );
}
