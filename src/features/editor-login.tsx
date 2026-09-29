"use client";
import { useState } from "react";
import { browserClient } from "@/shared/supabase/browser";
export function EditorLogin({ expired = false }: { expired?: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    expired ? "로그인 링크가 만료되었어요. 새 링크를 요청해 주세요." : "",
  );
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        const email = String(new FormData(e.currentTarget).get("email"));
        try {
          const { error } = await browserClient().auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (error) throw error;
          setMessage(
            "로그인 링크를 요청했어요. 등록된 이메일의 받은 편지함을 확인해 주세요.",
          );
        } catch {
          setError(
            "로그인 링크를 보내지 못했어요. 등록된 이메일과 서비스 설정을 확인해 주세요.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="email">편집자 이메일</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="hello@example.com"
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <button disabled={busy} className="button primary full">
        {busy ? "보내는 중…" : "로그인 링크 받기"}
      </button>
    </form>
  );
}
