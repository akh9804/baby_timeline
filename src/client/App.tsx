import { useEffect, useState, type FormEvent } from 'react';

interface MediaItem {
  id: number;
  filename: string;
  createdAt: string;
  contentType: string | null;
  thumbnailContentType: string | null;
  sizeBytes: number | null;
}

const imageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

function formatFileSize(sizeBytes: number | null) {
  if (sizeBytes === null) {
    return '파일 정보 없음';
  }

  if (sizeBytes === 0) {
    return '0 KB';
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);

  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}

function App() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function loadMedia() {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/media');

      if (!response.ok) {
        if (response.status === 401) {
          setIsAuthenticated(false);
          throw new Error('로그인 시간이 끝났어요. 다시 로그인해 주세요.');
        }

        throw new Error('기록을 불러오지 못했어요. 서버가 실행 중인지 확인해 주세요.');
      }

      setMediaItems((await response.json()) as MediaItem[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '기록을 불러오지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/auth/session');

        if (!response.ok) {
          throw new Error('로그인 상태를 확인하지 못했어요.');
        }

        const session = (await response.json()) as { authenticated: boolean };
        setIsAuthenticated(session.authenticated);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '로그인 상태를 확인하지 못했어요.');
      } finally {
        setIsCheckingSession(false);
      }
    }

    void checkSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void loadMedia();
    }
  }, [isAuthenticated]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });

      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        throw new Error(result.message ?? '로그인하지 못했어요.');
      }

      setLoginPassword('');
      setIsAuthenticated(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '로그인하지 못했어요.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/auth/logout', { method: 'POST' });
    } catch {
      // Clear the private album from this page even if the server is unreachable.
    } finally {
      setIsAuthenticated(false);
      setMediaItems([]);
      setErrorMessage('');
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!selectedFile) {
      setErrorMessage('먼저 사진이나 동영상을 선택해 주세요.');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');

    const formData = new FormData();
    formData.set('file', selectedFile);

    try {
      const response = await fetch('/media/upload', { method: 'POST', body: formData });

      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        throw new Error(result.message ?? '파일을 저장하지 못했어요.');
      }

      setSelectedFile(null);
      form.reset();
      await loadMedia();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '파일을 저장하지 못했어요.');
    } finally {
      setIsUploading(false);
    }
  }

  if (isCheckingSession) {
    return <div className="empty-state skeleton">가족 앨범을 확인하고 있어요…</div>;
  }

  if (!isAuthenticated) {
    return (
      <>
        <header className="site-header">
          <a className="brand" href="/" aria-label="작은 날들 홈">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
              <path
                d="M12 21V10m0 7c-4.5 0-7-2.4-7-6 4.4 0 7 2 7 6Zm0-4c0-4.2 2.6-7 7-7 0 3.9-2.5 7-7 7Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            작은 날들<span>BABY TIMELINE</span>
          </a>
        </header>
        <main className="page-width login-page">
          <section className="timeline-intro">
            <span className="eyebrow">A PRIVATE FAMILY ALBUM</span>
            <h1>가족 앨범에 로그인해 주세요</h1>
            <p>가족에게 공유한 비밀번호를 입력하면 소중한 기록을 볼 수 있어요.</p>
          </section>
          <section className="form-section login-section" aria-labelledby="login-title">
            <h2 id="login-title">가족 비밀번호</h2>
            <form onSubmit={handleLogin}>
              <label className="login-field">
                <span>비밀번호</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.currentTarget.value)}
                  required
                />
              </label>
              {errorMessage && (
                <div className="error" role="alert">
                  {errorMessage}
                </div>
              )}
              <button className="button primary full" type="submit" disabled={!loginPassword || isLoggingIn}>
                {isLoggingIn ? '확인하는 중…' : '앨범 열기'}
              </button>
            </form>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="작은 날들 홈">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
            <path
              d="M12 21V10m0 7c-4.5 0-7-2.4-7-6 4.4 0 7 2 7 6Zm0-4c0-4.2 2.6-7 7-7 0 3.9-2.5 7-7 7Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          작은 날들<span>BABY TIMELINE</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a className="button primary small" href="#upload">
            <span aria-hidden="true">＋</span> 사진 추가
          </a>
          <button className="button small logout-button" type="button" onClick={() => void handleLogout()}>
            로그아웃
          </button>
        </nav>
      </header>
      <div className="privacy-line">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        우리 가족만 함께 보는 비공개 앨범
      </div>

      <main className="page-width">
        <section className="timeline-intro">
          <span className="eyebrow">EVERY LITTLE MOMENT</span>
          <h1>
            우리 가족의 작은 날들
            <svg viewBox="0 0 24 24" width="27" height="27" fill="none" aria-hidden="true">
              <path
                d="M20.8 8.7c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          </h1>
          <p>매일 조금씩 자라는 우리, 오래도록 기억하고 싶은 순간들.</p>
          <div className="intro-tags">
            <span>
              <span aria-hidden="true">✳</span> 함께 쌓아가는 성장 기록
            </span>
            <span>사진과 동영상</span>
          </div>
        </section>

        <section id="upload" className="form-section upload-section" aria-labelledby="upload-title">
          <h2 id="upload-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
              <path
                d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            새로운 순간 담기
          </h2>
          <p className="muted upload-description">사진이나 동영상을 올려 가족의 기록을 시작해 보세요.</p>
          <form onSubmit={handleUpload}>
            <label className="dropzone">
              <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true">
                <rect x="3.5" y="4" width="21" height="20" rx="3" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="m5 21 6-6 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <strong>{selectedFile?.name ?? '사진 또는 동영상을 선택해 주세요'}</strong>
              <span>JPG, PNG, WebP, MP4, MOV · 파일당 최대 1GB</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
            <button className="button primary full" type="submit" disabled={!selectedFile || isUploading}>
              {isUploading ? '저장하는 중…' : '추억 저장하기'}
            </button>
          </form>
          <p className="field-help">원본 파일은 설정한 저장 공간에 그대로 보관됩니다.</p>
        </section>

        <div className="section-heading">
          <h2>우리 가족의 기록</h2>
          <span>{mediaItems.length}개의 순간</span>
        </div>

        {errorMessage && (
          <div className="error" role="alert">
            {errorMessage}{' '}
            <button className="retry-button" type="button" onClick={() => void loadMedia()}>
              다시 시도
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="empty-state skeleton">소중한 순간을 불러오고 있어요…</div>
        ) : mediaItems.length === 0 ? (
          <div className="empty-state">
            <div className="icon-box" aria-hidden="true">
              ✳
            </div>
            <h2>첫 번째 추억을 기다리고 있어요</h2>
            <p>작은 순간 하나로 우리 가족의 이야기를 시작해 보세요.</p>
            <a className="button primary" href="#upload">
              첫 사진 올리기
            </a>
          </div>
        ) : (
          <div className="archive-grid">
            {mediaItems.map((item) => {
              const fileUrl = `/media/${item.id}/file`;
              const isImage = item.contentType !== null && imageTypes.has(item.contentType);
              const isVideo = item.contentType !== null && videoTypes.has(item.contentType);
              const previewUrl = isImage ? `/media/${item.id}/thumbnail` : fileUrl;
              const posterUrl = isVideo && item.thumbnailContentType ? `/media/${item.id}/thumbnail` : undefined;

              return (
                <article className="moment-card archive-card" key={item.id}>
                  <div className="media-item">
                    {isImage ? (
                      <img src={previewUrl} alt={item.filename} loading="lazy" />
                    ) : isVideo ? (
                      <video src={fileUrl} poster={posterUrl} controls preload="metadata" aria-label={item.filename} />
                    ) : (
                      <div className="media-placeholder">
                        <span aria-hidden="true">✳</span>
                        {item.sizeBytes === null
                          ? '업로드된 파일이 없는 기록이에요.'
                          : '미리보기를 지원하지 않는 파일이에요.'}
                      </div>
                    )}
                  </div>
                  <footer>
                    <span className="archive-filename" title={item.filename}>
                      {item.filename}
                    </span>
                    <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                    {item.sizeBytes !== null ? (
                      <a
                        className="download-link"
                        href={fileUrl}
                        download={item.filename}
                        aria-label={`${item.filename} 다운로드`}
                      >
                        다운로드 ↓
                      </a>
                    ) : (
                      <span className="file-missing">파일 없음</span>
                    )}
                    <span>{formatFileSize(item.sizeBytes)}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        <p className="album-footer">작은 날들, 오래 남을 이야기.</p>
      </main>
    </>
  );
}

export default App;
