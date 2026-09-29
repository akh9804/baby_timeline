"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { browserClient } from "@/shared/supabase/browser";
import { navigateFresh } from "@/shared/utils/navigation";
export function EditorLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const email = String(new FormData(e.currentTarget).get("email"));
        const password = String(new FormData(e.currentTarget).get("password"));
        try {
          const { error } = await browserClient().auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          navigateFresh("/timeline");
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message.toLowerCase() : "";
          setError(
            message.includes("invalid login credentials") ||
              message.includes("invalid")
              ? "이메일 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요."
              : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.",
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
      <label htmlFor="password">비밀번호</label>
      <div className="password-input">
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="비밀번호를 입력해 주세요"
        />
        <button
          type="button"
          className="icon-button"
          aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className="button primary full">
        {busy ? "로그인 중…" : "편집자 로그인"}
      </button>
    </form>
  );
}
