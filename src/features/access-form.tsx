"use client";
import { navigateFresh } from "@/shared/utils/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
export function AccessForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        try {
          const response = await fetch("/api/access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: data.get("password") }),
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
          }
          navigateFresh("/timeline");
        } catch (e) {
          setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
          setBusy(false);
        }
      }}
    >
      <label htmlFor="password">가족 비밀번호</label>
      <div className="password-input">
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={72}
          placeholder="비밀번호를 입력해 주세요"
        />
        <button
          type="button"
          className="icon-button"
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? "확인하고 있어요…" : "우리 가족 앨범 들어가기"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
