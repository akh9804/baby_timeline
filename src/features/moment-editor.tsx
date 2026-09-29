"use client";
import { navigateFresh } from "@/shared/utils/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, ArrowLeft, X, Trash2, CalendarDays } from "lucide-react";
import type { Child, Moment } from "@/entities/types";
import { browserClient } from "@/shared/supabase/browser";
import { toLocalInput } from "@/shared/utils/dates";
import { inspectFile, uploadMedia, type SelectedFile } from "./upload-media";
import { PrivateMedia } from "./private-media";
export function MomentEditor({ momentId }: { momentId?: string }) {
  const cache = useQueryClient();
  const [child, setChild] = useState<Child | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [id, setId] = useState(momentId);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const db = browserClient();
        const c = await db
          .from("children")
          .select("id,name,due_date,birth_date")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (c.error) throw c.error;
        if (!alive) return;
        setChild(c.data);
        setDate(toLocalInput(new Date().toISOString()));
        if (momentId) {
          const m = await db
            .from("moments")
            .select(
              "id,child_id,title,description,occurred_at,media(id,type,width,height,file_name,sort_order)",
            )
            .eq("id", momentId)
            .single();
          if (m.error) throw m.error;
          if (!alive) return;
          setMoment(m.data);
          setTitle(m.data.title);
          setDescription(m.data.description ?? "");
          setDate(toLocalInput(m.data.occurred_at));
        }
      } catch {
        if (alive)
          setError(
            "편집 정보를 불러오지 못했어요. 편집자 권한과 연결을 확인해 주세요.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [momentId]);
  async function remove(kind: "moments" | "media", targetId: string) {
    if (
      !window.confirm(
        kind === "moments"
          ? "이 기록과 연결된 사진·영상을 모두 삭제할까요? 복구할 수 없어요."
          : "이 파일을 삭제할까요? 복구할 수 없어요.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/${kind}/${targetId}`, { method: "DELETE" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      await cache.invalidateQueries({ queryKey: ["timeline"] });
      cache.removeQueries({ queryKey: ["media-url", targetId] });
      if (body.cleanupPending) {
        setError(
          "기록은 삭제했지만 원본 파일 정리가 대기 중이에요. 관리자에게 파일 정리를 요청해 주세요.",
        );
        if (kind === "media")
          setMoment((m) =>
            m
              ? { ...m, media: m.media.filter((x) => x.id !== targetId) }
              : null,
          );
        else {
          setId(undefined);
          setMoment(null);
        }
      } else if (kind === "moments") navigateFresh("/timeline");
      else
        setMoment((m) =>
          m ? { ...m, media: m.media.filter((x) => x.id !== targetId) } : null,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="page-width editor-page">
        <div className="empty-state skeleton">기록을 준비하고 있어요…</div>
      </main>
    );
  return (
    <main className="page-width editor-page">
      <Link href="/timeline" className="back-link">
        <ArrowLeft size={16} />
        타임라인으로
      </Link>
      <span className="eyebrow">A MOMENT TO REMEMBER</span>
      <h1>{id ? "소중한 기록 다듬기" : "오늘의 작은 순간"}</h1>
      <p className="muted">
        평범한 하루도, 특별한 처음도. 잊고 싶지 않은 순간을 남겨요.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!child ? (
        <section className="form-card">
          <h2>우리 아이를 소개해 주세요</h2>
          <p className="muted">
            첫 기록 전에 이름과 날짜를 알려주세요. 나중에 수정할 수 있어요.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                const r = await browserClient()
                  .from("children")
                  .insert({
                    name: form.get("name"),
                    due_date: form.get("due") || null,
                    birth_date: form.get("birth") || null,
                  })
                  .select("id,name,due_date,birth_date")
                  .single();
                if (r.error) throw r.error;
                setChild(r.data);
                await cache.invalidateQueries({ queryKey: ["timeline"] });
              } catch {
                setError("아이 정보를 저장하지 못했어요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="name">이름 또는 태명</label>
            <input id="name" name="name" required maxLength={60} />
            <label htmlFor="due">출산 예정일</label>
            <input id="due" name="due" type="date" />
            <label htmlFor="birth">태어난 날 (출생 후 입력)</label>
            <input id="birth" name="birth" type="date" />
            <button disabled={busy} className="button primary full">
              아이 정보 저장
            </button>
          </form>
        </section>
      ) : (
        <>
          <details className="child-settings">
            <summary>{child.name ?? "우리 아이"} · 아이 정보 수정</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const f = new FormData(e.currentTarget);
                try {
                  const update = {
                    name: String(f.get("name")),
                    due_date: String(f.get("due")) || null,
                    birth_date: String(f.get("birth")) || null,
                  };
                  const r = await browserClient()
                    .from("children")
                    .update(update)
                    .eq("id", child.id)
                    .select("id")
                    .single();
                  if (r.error) throw r.error;
                  setChild({ ...child, ...update });
                  await cache.invalidateQueries({ queryKey: ["timeline"] });
                  setProgress("아이 정보를 저장했어요.");
                } catch {
                  setError("아이 정보를 수정하지 못했어요.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="child-name">이름 또는 태명</label>
              <input
                id="child-name"
                name="name"
                defaultValue={child.name ?? ""}
                required
                maxLength={60}
              />
              <div className="form-row">
                <div>
                  <label htmlFor="child-due">출산 예정일</label>
                  <input
                    id="child-due"
                    name="due"
                    type="date"
                    defaultValue={child.due_date ?? ""}
                  />
                </div>
                <div>
                  <label htmlFor="child-birth">태어난 날</label>
                  <input
                    id="child-birth"
                    name="birth"
                    type="date"
                    defaultValue={child.birth_date ?? ""}
                  />
                </div>
              </div>
              <button className="button secondary" disabled={busy}>
                아이 정보 저장
              </button>
            </form>
          </details>
          <form
            className="moment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (!title.trim()) throw new Error("제목을 입력해 주세요.");
                const db = browserClient();
                const targetId = id ?? crypto.randomUUID();
                const values = {
                  title: title.trim(),
                  description: description.trim() || null,
                  occurred_at: new Date(date).toISOString(),
                };
                if (id) {
                  const r = await db
                    .from("moments")
                    .update(values)
                    .eq("id", id)
                    .select("id")
                    .single();
                  if (r.error) throw r.error;
                } else {
                  const r = await db
                    .from("moments")
                    .insert({ ...values, id: targetId, child_id: child.id })
                    .select("id")
                    .single();
                  if (r.error) {
                    const check = await db
                      .from("moments")
                      .select("id")
                      .eq("id", targetId)
                      .maybeSingle();
                    if (!check.data) throw r.error;
                  }
                  setId(targetId);
                }
                const lastOrder = Math.max(
                  -1,
                  ...(moment?.media.map((m) => m.sort_order) ?? []),
                );
                for (let i = 0; i < files.length; i++) {
                  setProgress(
                    `${i + 1}/${files.length} · ${files[i].file.name} 업로드 중…`,
                  );
                  await uploadMedia(
                    child.id,
                    targetId,
                    files[i],
                    lastOrder + 1 + i,
                  );
                }
                await cache.invalidateQueries({ queryKey: ["timeline"] });
                navigateFresh("/timeline");
              } catch (e) {
                setError(e instanceof Error ? e.message : "저장하지 못했어요.");
                setProgress(
                  "이미 저장된 기록과 파일은 유지돼요. 다시 저장하면 이어서 진행해요.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <section className="form-section">
              <h2>
                <CalendarDays size={19} />이 순간의 이야기
              </h2>
              <label htmlFor="occurred-at">기록 날짜와 시간</label>
              <input
                id="occurred-at"
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="field-help">
                촬영한 순간을 기준으로 기록해요. 입력 시간은 현재 기기의
                시간대입니다.
              </p>
              <label htmlFor="title">제목</label>
              <input
                id="title"
                required
                maxLength={120}
                placeholder="예: 처음 만난 작은 심장 소리"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label htmlFor="description">
                함께 남기는 이야기 <span className="muted">(선택)</span>
              </label>
              <textarea
                id="description"
                rows={4}
                maxLength={5000}
                placeholder="그날의 기분, 오래 기억하고 싶은 마음을 적어주세요."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </section>
            <section className="form-section">
              <h2>
                <ImagePlus size={19} />
                사진과 영상
              </h2>
              <label className="dropzone" htmlFor="files">
                <ImagePlus size={29} />
                <strong>
                  {inspecting
                    ? "파일 정보를 읽는 중…"
                    : "사진이나 영상을 선택해 주세요"}
                </strong>
                <span>
                  JPG, PNG, WebP, GIF · MP4, MOV, WebM
                  <br />
                  파일당 최대 500MB · 원본 그대로 보관해요
                </span>
                <input
                  id="files"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  disabled={busy || inspecting}
                  onChange={async (e) => {
                    const selected = [...(e.target.files ?? [])];
                    e.target.value = "";
                    setInspecting(true);
                    setError("");
                    try {
                      const items: SelectedFile[] = [];
                      for (const f of selected)
                        items.push(await inspectFile(f));
                      setFiles((prev) => [...prev, ...items]);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "파일을 읽지 못했어요.",
                      );
                    } finally {
                      setInspecting(false);
                    }
                  }}
                />
              </label>
              <p className="field-help">
                HEIC는 JPG로 변환해 주세요. MOV 등 영상의 재생 가능 여부는
                브라우저 코덱에 따라 달라요.
              </p>
              {files.map((item) => (
                <div className="selected-file" key={item.id}>
                  <div className="file-heading">
                    <strong>{item.file.name}</strong>
                    <button
                      type="button"
                      disabled={busy}
                      className="icon-button"
                      aria-label={`${item.file.name} 선택 취소`}
                      onClick={() =>
                        setFiles(files.filter((f) => f.id !== item.id))
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <span className="field-help">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    {item.width ? ` · ${item.width} × ${item.height}` : ""}
                  </span>
                  <label htmlFor={`captured-${item.id}`}>
                    촬영 시간 (선택 · EXIF에서 자동 입력)
                  </label>
                  <input
                    id={`captured-${item.id}`}
                    type="datetime-local"
                    disabled={busy}
                    value={item.capturedAt}
                    onChange={(e) =>
                      setFiles(
                        files.map((f) =>
                          f.id === item.id
                            ? { ...f, capturedAt: e.target.value }
                            : f,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              {moment && moment.media.length > 0 && (
                <div className="existing-media">
                  {moment.media.map((media) => (
                    <div key={media.id}>
                      <PrivateMedia media={media} />
                      <button
                        type="button"
                        className="button danger small"
                        disabled={busy}
                        onClick={() => remove("media", media.id)}
                      >
                        <Trash2 size={14} />
                        파일 삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {progress && (
              <p className="success" role="status" aria-live="polite">
                {progress}
              </p>
            )}
            <div className="form-actions">
              {id && (
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={() => remove("moments", id)}
                >
                  <Trash2 size={16} />
                  기록 삭제
                </button>
              )}
              <button className="button primary" disabled={busy || inspecting}>
                {busy ? "저장하고 있어요…" : "소중한 순간 저장하기"}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
