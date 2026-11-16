import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Child {
  id: number;
  name: string | null;
  dueDate: string | null;
  birthDate: string | null;
}

interface TimelineMedia {
  id: number;
  filename: string;
  contentType: string | null;
  thumbnailContentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

interface Moment {
  id: number;
  title: string;
  description: string | null;
  occurredAt: string;
  media: TimelineMedia[];
  comments: Comment[];
}

interface Comment {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface TimelineResponse {
  child: Child | null;
  moments: Moment[];
  nextCursor: string | null;
}

interface LegacyMedia {
  id: number;
  filename: string;
  createdAt: string;
  contentType: string | null;
  thumbnailContentType: string | null;
  sizeBytes: number | null;
}

interface LoanRepayment {
  id: number;
  amount: number;
  repaidAt: string;
}

interface LoanResponse {
  initialBalance: number;
  currentBalance: number;
  repayments: LoanRepayment[];
}

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
type ViewMode = 'timeline' | 'gallery';

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  status: UploadStatus;
}

const imageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

function localDateTime() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);
}

function ageLabel(value: string, child: Child) {
  const reference = new Date(value);
  const birth = child.birthDate ? new Date(`${child.birthDate}T00:00:00`) : null;
  if (birth && !Number.isNaN(reference.getTime())) {
    const days = Math.max(0, Math.floor((reference.getTime() - birth.getTime()) / 86_400_000));
    return days === 0 ? 'D+0' : `D+${days}`;
  }
  if (child.dueDate) {
    const due = new Date(`${child.dueDate}T00:00:00`);
    const weeks = Math.floor((due.getTime() - reference.getTime()) / (7 * 86_400_000));
    return weeks > 0 ? `만나기 ${weeks}주 전` : '소중한 하루';
  }
  return '소중한 하루';
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function formatWon(amount: number) {
  return `${new Intl.NumberFormat('ko-KR').format(amount)}원`;
}

function uploadFile(file: File, momentId: number, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/media/upload?momentId=${momentId}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`${file.name} 파일을 저장하지 못했어요.`));
    });
    request.addEventListener('error', () => reject(new Error(`${file.name} 파일을 업로드하지 못했어요.`)));
    const formData = new FormData();
    formData.set('file', file);
    request.send(formData);
  });
}

type AdminPage = 'timeline' | 'loan';

const adminPages: Array<{ id: AdminPage; label: string }> = [
  { id: 'timeline', label: '앨범' },
  { id: 'loan', label: '대출 관리' },
];

function AdminNavigation({
  activePage,
  onNavigate,
  onLogout,
  onCreateRecord,
}: {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  onLogout: () => void;
  onCreateRecord?: () => void;
}) {
  return (
    <>
      <header className="site-header admin-site-header">
        <a className="brand" href="/" onClick={() => onNavigate('timeline')} aria-label="작은 날들 홈">
          ✳ 작은 날들<span>BABY TIMELINE</span>
        </a>
        <div className="admin-header-tools">
          {onCreateRecord && (
            <button className="button primary small" type="button" onClick={onCreateRecord}>
              ＋ 기록 남기기
            </button>
          )}
          <button className="button small logout-button" type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <nav className="admin-tab-bar" aria-label="관리자 페이지 메뉴">
        <div className="admin-tab-inner">
          {adminPages.map((page) => (
            <button
              className={`admin-nav-link${activePage === page.id ? ' active' : ''}`}
              type="button"
              aria-current={activePage === page.id ? 'page' : undefined}
              key={page.id}
              onClick={() => onNavigate(page.id)}
            >
              {page.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

function App() {
  const [timeline, setTimeline] = useState<TimelineResponse>({ child: null, moments: [], nextCursor: null });
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [legacyMedia, setLegacyMedia] = useState<LegacyMedia[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'viewer' | null>(null);
  const [isLoanPage, setIsLoanPage] = useState(false);
  const [loan, setLoan] = useState<LoanResponse | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isLoadingLoan, setIsLoadingLoan] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDescription, setRecordDescription] = useState('');
  const [recordDate, setRecordDate] = useState(localDateTime);
  const [editingMomentId, setEditingMomentId] = useState<number | null>(null);
  const [childName, setChildName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isEditingChild, setIsEditingChild] = useState(false);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<TimelineMedia | null>(null);
  const [viewerMediaItems, setViewerMediaItems] = useState<TimelineMedia[]>([]);
  const [isViewerThumbnailLoaded, setIsViewerThumbnailLoaded] = useState(false);
  const [isViewerOriginalLoaded, setIsViewerOriginalLoaded] = useState(false);
  const viewerTouchStartX = useRef<number | null>(null);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentAuthor, setEditingCommentAuthor] = useState('');
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  async function loadTimeline(cursor?: string, requestedChildId?: number | null) {
    if (cursor) setIsLoadingMore(true);
    else setIsLoading(true);
    try {
      let childId = requestedChildId ?? selectedChildId;
      let mediaResponse: Response | null = null;
      if (!cursor) {
        const childrenResponse = await fetch('/children');
        if (!childrenResponse.ok) throw new Error('아이 정보를 불러오지 못했어요.');
        const childList = (await childrenResponse.json()) as Child[];
        setChildren(childList);
        childId ??= childList[0]?.id ?? null;
        setSelectedChildId(childId);
        mediaResponse = await fetch('/media');
      }
      const query = new URLSearchParams();
      if (childId) query.set('childId', String(childId));
      if (cursor) query.set('cursor', cursor);
      const timelineResponse = await fetch(`/timeline${query.toString() ? `?${query}` : ''}`);
      if (!timelineResponse.ok || (mediaResponse && !mediaResponse.ok)) throw new Error('기록을 불러오지 못했어요.');
      const nextPage = (await timelineResponse.json()) as TimelineResponse;
      setTimeline((current) =>
        cursor
          ? { ...nextPage, child: current.child ?? nextPage.child, moments: [...current.moments, ...nextPage.moments] }
          : nextPage,
      );
      if (mediaResponse) setLegacyMedia((await mediaResponse.json()) as LegacyMedia[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '기록을 불러오지 못했어요.');
    } finally {
      if (cursor) setIsLoadingMore(false);
      else setIsLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/auth/session');
        const session = (await response.json()) as { authenticated: boolean; role: 'admin' | 'viewer' | null };
        setIsAuthenticated(session.authenticated);
        setUserRole(session.role);
      } catch {
        setErrorMessage('로그인 상태를 확인하지 못했어요.');
      } finally {
        setIsCheckingSession(false);
      }
    }
    void checkSession();
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadTimeline();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!viewerMedia) {
      setIsViewerThumbnailLoaded(false);
      setIsViewerOriginalLoaded(false);
      return;
    }

    setIsViewerThumbnailLoaded(false);
    setIsViewerOriginalLoaded(false);
    if (videoTypes.has(viewerMedia.contentType ?? '')) {
      setIsViewerThumbnailLoaded(true);
      setIsViewerOriginalLoaded(true);
      return;
    }
    const thumbnail = new Image();
    const original = new Image();
    thumbnail.onload = () => setIsViewerThumbnailLoaded(true);
    original.onload = () => setIsViewerOriginalLoaded(true);
    thumbnail.src = `/media/${viewerMedia.id}/thumbnail`;
    original.src = `/media/${viewerMedia.id}/file`;

    return () => {
      thumbnail.onload = null;
      original.onload = null;
    };
  }, [viewerMedia]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage('');
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(isAdminLogin ? { username: loginUsername } : {}), password: loginPassword }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        throw new Error(result.message ?? '로그인하지 못했어요.');
      }
      const result = (await response.json()) as { role: 'admin' | 'viewer' };
      setLoginUsername('');
      setLoginPassword('');
      setIsAdminLogin(false);
      setIsAuthenticated(true);
      setUserRole(result.role);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '로그인하지 못했어요.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setIsAuthenticated(false);
    setUserRole(null);
    setTimeline({ child: null, moments: [], nextCursor: null });
    setChildren([]);
    setSelectedChildId(null);
    setLegacyMedia([]);
    setIsLoanPage(false);
    setLoan(null);
    setErrorMessage('');
  }

  async function openLoanPage() {
    setIsLoanPage(true);
    setIsLoadingLoan(true);
    setErrorMessage('');
    try {
      const response = await fetch('/admin/loan');
      if (!response.ok) throw new Error('대출 정보를 불러오지 못했어요.');
      setLoan((await response.json()) as LoanResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '대출 정보를 불러오지 못했어요.');
    } finally {
      setIsLoadingLoan(false);
    }
  }

  async function saveRepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(repaymentAmount);
    if (!Number.isInteger(amount) || amount < 1) return;

    setIsSaving(true);
    setErrorMessage('');
    try {
      const response = await fetch('/admin/loan/repayments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount, repaidAt: repaymentDate }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        throw new Error(result.message ?? '상환 내역을 저장하지 못했어요.');
      }
      setRepaymentAmount('');
      await openLoanPage();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '상환 내역을 저장하지 못했어요.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    try {
      const isUpdate = Boolean(timeline.child && !isAddingChild);
      const response = await fetch(isUpdate ? `/children/${timeline.child!.id}` : '/children', {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: childName || null, dueDate: dueDate || null, birthDate: birthDate || null }),
      });
      if (!response.ok) throw new Error('아이 정보를 저장하지 못했어요.');
      const savedChild = (await response.json()) as Child;
      setSelectedChildId(savedChild.id);
      setIsAddingChild(false);
      setIsEditingChild(false);
      await loadTimeline(undefined, savedChild.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '아이 정보를 저장하지 못했어요.');
    } finally {
      setIsSaving(false);
    }
  }

  function beginChildEdit() {
    setChildName(timeline.child?.name ?? '');
    setDueDate(timeline.child?.dueDate ?? '');
    setBirthDate(timeline.child?.birthDate ?? '');
    setIsEditingChild(true);
    setIsAddingChild(false);
  }

  function beginChildAdd() {
    setChildName('');
    setDueDate('');
    setBirthDate('');
    setIsAddingChild(true);
    setIsEditingChild(true);
  }

  function selectChild(childId: number) {
    setSelectedChildId(childId);
    resetMomentForm();
    void loadTimeline(undefined, childId);
  }

  function beginMomentEdit(moment: Moment) {
    setEditingMomentId(moment.id);
    setRecordTitle(moment.title);
    setRecordDescription(moment.description ?? '');
    setRecordDate(moment.occurredAt.slice(0, 16));
    document.getElementById('record-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetMomentForm() {
    setEditingMomentId(null);
    setRecordTitle('');
    setRecordDescription('');
    setRecordDate(localDateTime());
    setUploadItems((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  function selectUploadFiles(files: File[]) {
    setUploadItems((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return files.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null,
        progress: 0,
        status: 'pending' as UploadStatus,
      }));
    });
  }

  function removeUploadItem(id: string) {
    setUploadItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function saveMoment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!timeline.child || !recordTitle.trim()) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const isEditing = editingMomentId !== null;
      const response = await fetch(isEditing ? `/moments/${editingMomentId}` : '/moments', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(isEditing ? {} : { childId: timeline.child.id }),
          title: recordTitle.trim(),
          description: recordDescription.trim() || null,
          occurredAt: new Date(recordDate).toISOString(),
        }),
      });
      if (!response.ok) throw new Error('기록을 저장하지 못했어요.');
      const moment = (await response.json()) as Moment;
      if (uploadItems.length > 0) {
        for (const item of uploadItems) {
          setUploadItems((current) =>
            current.map((entry) => (entry.id === item.id ? { ...entry, status: 'uploading' } : entry)),
          );
          try {
            await uploadFile(item.file, moment.id, (progress) => {
              setUploadItems((current) =>
                current.map((entry) => (entry.id === item.id ? { ...entry, progress } : entry)),
              );
            });
            setUploadItems((current) =>
              current.map((entry) => (entry.id === item.id ? { ...entry, progress: 100, status: 'done' } : entry)),
            );
          } catch (error) {
            setUploadItems((current) =>
              current.map((entry) => (entry.id === item.id ? { ...entry, status: 'error' } : entry)),
            );
            throw error;
          }
        }
      }
      resetMomentForm();
      await loadTimeline();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '기록을 저장하지 못했어요.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMoment(momentId: number) {
    if (!window.confirm('이 기록과 연결된 미디어를 삭제할까요?')) return;
    const response = await fetch(`/moments/${momentId}`, { method: 'DELETE' });
    if (!response.ok) setErrorMessage('기록을 삭제하지 못했어요.');
    else await loadTimeline();
  }

  async function deleteMedia(mediaId: number) {
    if (!window.confirm('이 사진 또는 동영상을 삭제할까요?')) return;
    const response = await fetch(`/media/${mediaId}`, { method: 'DELETE' });
    if (!response.ok) {
      setErrorMessage('미디어를 삭제하지 못했어요.');
      return;
    }
    setTimeline((current) => ({
      ...current,
      moments: current.moments.map((moment) => ({
        ...moment,
        media: moment.media.filter((media) => media.id !== mediaId),
      })),
    }));
  }

  async function addComment(event: FormEvent<HTMLFormElement>, momentId: number) {
    event.preventDefault();
    if (!commentAuthor.trim() || !commentContent.trim()) return;
    setIsSavingComment(true);
    try {
      const response = await fetch(`/moments/${momentId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ author: commentAuthor.trim(), content: commentContent.trim() }),
      });
      if (!response.ok) throw new Error('댓글을 저장하지 못했어요.');
      const comment = (await response.json()) as Comment;
      setTimeline((current) => ({
        ...current,
        moments: current.moments.map((moment) =>
          moment.id === momentId ? { ...moment, comments: [...moment.comments, comment] } : moment,
        ),
      }));
      setCommentAuthor('');
      setCommentContent('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '댓글을 저장하지 못했어요.');
    } finally {
      setIsSavingComment(false);
    }
  }

  async function updateComment(event: FormEvent<HTMLFormElement>, commentId: number) {
    event.preventDefault();
    if (!editingCommentAuthor.trim() || !editingCommentContent.trim()) return;
    setIsSavingComment(true);
    try {
      const response = await fetch(`/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ author: editingCommentAuthor.trim(), content: editingCommentContent.trim() }),
      });
      if (!response.ok) throw new Error('댓글을 수정하지 못했어요.');
      const updated = (await response.json()) as Comment;
      setTimeline((current) => ({
        ...current,
        moments: current.moments.map((moment) => ({
          ...moment,
          comments: moment.comments.map((comment) => (comment.id === commentId ? updated : comment)),
        })),
      }));
      setEditingCommentId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '댓글을 수정하지 못했어요.');
    } finally {
      setIsSavingComment(false);
    }
  }

  async function deleteComment(commentId: number) {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    const response = await fetch(`/comments/${commentId}`, { method: 'DELETE' });
    if (!response.ok) {
      setErrorMessage('댓글을 삭제하지 못했어요.');
      return;
    }
    setTimeline((current) => ({
      ...current,
      moments: current.moments.map((moment) => ({
        ...moment,
        comments: moment.comments.filter((comment) => comment.id !== commentId),
      })),
    }));
  }

  function scrollToRecord() {
    document.getElementById('record-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openViewer(media: TimelineMedia, mediaItems: TimelineMedia[]) {
    const supportedMedia = mediaItems.filter(
      (item) => imageTypes.has(item.contentType ?? '') || videoTypes.has(item.contentType ?? ''),
    );
    setViewerMediaItems(supportedMedia);
    setViewerMedia(media);
  }

  function closeViewer() {
    setViewerMedia(null);
    setViewerMediaItems([]);
  }

  function moveViewer(direction: -1 | 1) {
    if (!viewerMedia) return;
    const currentIndex = viewerMediaItems.findIndex((media) => media.id === viewerMedia.id);
    const nextMedia = viewerMediaItems[currentIndex + direction];
    if (nextMedia) setViewerMedia(nextMedia);
  }

  function handleViewerTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    viewerTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleViewerTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const startX = viewerTouchStartX.current;
    viewerTouchStartX.current = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined || Math.abs(endX - startX) < 50) return;
    moveViewer(endX < startX ? 1 : -1);
  }

  if (isCheckingSession) return <div className="empty-state skeleton">가족 앨범을 확인하고 있어요…</div>;

  if (!isAuthenticated) {
    return (
      <>
        <header className="site-header">
          <a className="brand" href="/" aria-label="작은 날들 홈">
            ✳ 작은 날들<span>BABY TIMELINE</span>
          </a>
        </header>
        <main className="page-width login-page">
          <section className="timeline-intro">
            <span className="eyebrow">A PRIVATE FAMILY ALBUM</span>
            <h1>{isAdminLogin ? '관리자 계정으로 로그인해 주세요' : '가족 앨범에 로그인해 주세요'}</h1>
            <p>
              {isAdminLogin
                ? '등록된 관리자만 가족의 기록을 남길 수 있어요.'
                : '가족 비밀번호로 소중한 기록을 만나보세요.'}
            </p>
          </section>
          <section className="form-section login-section" aria-labelledby="login-title">
            <h2 id="login-title">{isAdminLogin ? '관리자 로그인' : '가족 비밀번호'}</h2>
            <form onSubmit={handleLogin}>
              {isAdminLogin && (
                <label className="login-field">
                  <span>관리자 아이디</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={loginUsername}
                    onChange={(event) => setLoginUsername(event.currentTarget.value)}
                    required
                  />
                </label>
              )}
              <label className="login-field">
                <span>{isAdminLogin ? '관리자 비밀번호' : '가족 비밀번호'}</span>
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
                {isLoggingIn ? '확인하는 중…' : isAdminLogin ? '관리자로 로그인' : '앨범 열기'}
              </button>
            </form>
            <button
              className="login-switch"
              type="button"
              onClick={() => {
                setIsAdminLogin((value) => !value);
                setLoginUsername('');
                setLoginPassword('');
                setErrorMessage('');
              }}
            >
              {isAdminLogin ? '← 가족 비밀번호로 들어가기' : '관리자로 로그인'}
            </button>
          </section>
        </main>
      </>
    );
  }

  if (isLoanPage && userRole === 'admin') {
    return (
      <>
        <AdminNavigation
          activePage="loan"
          onNavigate={(page) => {
            if (page === 'timeline') setIsLoanPage(false);
          }}
          onLogout={() => void handleLogout()}
        />
        <div className="privacy-line">▣ 관리자만 볼 수 있는 대출 정보</div>
        <main className="page-width">
          <section className="timeline-intro">
            <span className="eyebrow">ADMIN · LOAN TRACKER</span>
            <h1>대출 잔액</h1>
            <p>상환 내역을 기록하면 현재 남은 잔액을 자동으로 계산해요.</p>
          </section>
          {isLoadingLoan && <div className="empty-state">대출 정보를 불러오고 있어요…</div>}
          {!isLoadingLoan && loan && (
            <>
              <section className="loan-balance-card" aria-label="현재 대출 잔액">
                <span className="eyebrow">CURRENT BALANCE</span>
                <strong>{formatWon(loan.currentBalance)}</strong>
                <span>초기 잔액 {formatWon(loan.initialBalance)}</span>
              </section>
              <section className="form-section" aria-labelledby="repayment-title">
                <h2 id="repayment-title">상환 내역 추가</h2>
                <form onSubmit={saveRepayment}>
                  <div className="form-row">
                    <label className="login-field">
                      <span>상환 금액 (원)</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={repaymentAmount}
                        onChange={(event) => setRepaymentAmount(event.currentTarget.value)}
                        placeholder="500000"
                        required
                      />
                    </label>
                    <label className="login-field">
                      <span>상환 날짜</span>
                      <input
                        type="date"
                        value={repaymentDate}
                        onChange={(event) => setRepaymentDate(event.currentTarget.value)}
                        required
                      />
                    </label>
                  </div>
                  <button className="button primary full" type="submit" disabled={isSaving || !repaymentAmount}>
                    {isSaving ? '저장하는 중…' : '상환 내역 저장'}
                  </button>
                </form>
              </section>
              <section className="loan-history" aria-labelledby="history-title">
                <div className="section-heading">
                  <div>
                    <h2 id="history-title">상환 내역</h2>
                    <span className="section-count">{loan.repayments.length}건</span>
                  </div>
                </div>
                {loan.repayments.length === 0 ? (
                  <p className="empty-state">아직 기록된 상환 내역이 없어요.</p>
                ) : (
                  <div className="loan-history-list">
                    {loan.repayments.map((repayment) => (
                      <div className="loan-history-item" key={repayment.id}>
                        <span>{repayment.repaidAt.replaceAll('-', '.')}</span>
                        <strong>- {formatWon(repayment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          {errorMessage && (
            <div className="error" role="alert">
              {errorMessage}
            </div>
          )}
        </main>
      </>
    );
  }

  const momentsByYear = new Map<string, Moment[]>();
  for (const moment of timeline.moments) {
    const year = moment.occurredAt.slice(0, 4);
    momentsByYear.set(year, [...(momentsByYear.get(year) ?? []), moment]);
  }
  const editingMoment =
    editingMomentId === null ? null : (timeline.moments.find((moment) => moment.id === editingMomentId) ?? null);
  const galleryItems = timeline.moments.flatMap((moment) =>
    moment.media
      .filter((media) => imageTypes.has(media.contentType ?? '') || videoTypes.has(media.contentType ?? ''))
      .map((media) => ({ ...media, momentTitle: moment.title, occurredAt: moment.occurredAt })),
  );

  return (
    <>
      {userRole === 'admin' ? (
        <AdminNavigation
          activePage="timeline"
          onNavigate={(page) => {
            if (page === 'loan') void openLoanPage();
          }}
          onLogout={() => void handleLogout()}
          onCreateRecord={scrollToRecord}
        />
      ) : (
        <header className="site-header">
          <a className="brand" href="/" aria-label="작은 날들 홈">
            ✳ 작은 날들<span>BABY TIMELINE</span>
          </a>
          <nav aria-label="주요 메뉴">
            <button className="button small logout-button" type="button" onClick={() => void handleLogout()}>
              로그아웃
            </button>
          </nav>
        </header>
      )}
      <div className="privacy-line">▣ 우리 가족만 함께 보는 비공개 앨범</div>
      <main className="page-width">
        <section className="timeline-intro">
          <span className="eyebrow">EVERY LITTLE MOMENT</span>
          <h1>{timeline.child?.name ? `${timeline.child.name}의 작은 날들` : '우리 가족의 작은 날들'} ♡</h1>
          <p>매일 조금씩 자라는 우리, 오래도록 기억하고 싶은 순간들.</p>
          <div className="intro-tags">
            <span>✳ 함께 쌓아가는 성장 기록</span>
            {timeline.child?.birthDate && <span>{timeline.child.birthDate.replaceAll('-', '.')} 태어났어요</span>}
            {timeline.child?.dueDate && !timeline.child.birthDate && (
              <span>{timeline.child.dueDate.replaceAll('-', '.')} 만날 예정이에요</span>
            )}
            {children.length > 1 && (
              <label className="child-picker">
                <span>보고 있는 아이</span>
                <select
                  value={selectedChildId ?? ''}
                  onChange={(event) => selectChild(Number(event.currentTarget.value))}
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name || `아이 ${child.id}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>

        {userRole === 'admin' && !timeline.child && (
          <section className="form-section record-editor">
            <h2>우리 아이를 소개해 주세요</h2>
            <p className="muted">첫 기록 전에 이름과 날짜를 알려주세요. 나중에 수정할 수 있어요.</p>
            <form onSubmit={saveChild}>
              <label className="login-field">
                <span>이름 또는 태명</span>
                <input
                  value={childName}
                  onChange={(event) => setChildName(event.currentTarget.value)}
                  required
                  maxLength={60}
                />
              </label>
              <div className="form-row">
                <label className="login-field">
                  <span>출산 예정일</span>
                  <input type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
                </label>
                <label className="login-field">
                  <span>태어난 날</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.currentTarget.value)} />
                </label>
              </div>
              <button className="button primary full" disabled={isSaving}>
                아이 정보 저장
              </button>
            </form>
          </section>
        )}

        {userRole === 'admin' && timeline.child && (
          <section id="record-editor" className="form-section record-editor" aria-labelledby="record-title">
            <div className="editor-heading">
              <div>
                <h2 id="record-title">{editingMomentId ? '소중한 기록 다듬기' : '오늘의 작은 순간'}</h2>
                <p className="muted">평범한 하루도 특별한 처음도, 잊고 싶지 않은 순간을 남겨요.</p>
              </div>
              <span className="editor-actions">
                <button className="text-button" type="button" onClick={beginChildEdit}>
                  아이 정보 수정
                </button>
                <button className="text-button" type="button" onClick={beginChildAdd}>
                  아이 추가
                </button>
              </span>
            </div>
            <form onSubmit={saveMoment}>
              <label className="login-field">
                <span>기록 제목</span>
                <input
                  value={recordTitle}
                  onChange={(event) => setRecordTitle(event.currentTarget.value)}
                  placeholder="예: 첫 걸음마"
                  required
                  maxLength={160}
                />
              </label>
              <label className="login-field">
                <span>기록 내용</span>
                <textarea
                  value={recordDescription}
                  onChange={(event) => setRecordDescription(event.currentTarget.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="그날의 이야기를 적어보세요"
                />
              </label>
              <label className="login-field">
                <span>기록한 날짜</span>
                <input
                  type="datetime-local"
                  value={recordDate}
                  onChange={(event) => setRecordDate(event.currentTarget.value)}
                  required
                />
              </label>
              {editingMoment && (
                <div className="editing-media-list">
                  <span className="field-label">현재 첨부된 미디어</span>
                  {editingMoment.media.length ? (
                    editingMoment.media.map((media) => (
                      <div className="editing-media-item" key={media.id}>
                        {imageTypes.has(media.contentType ?? '') ? (
                          <img src={`/media/${media.id}/thumbnail`} alt={media.filename} />
                        ) : (
                          <span className="editing-media-icon">▶</span>
                        )}
                        <span>{media.filename}</span>
                        <button
                          className="upload-remove"
                          type="button"
                          onClick={() => void deleteMedia(media.id)}
                          disabled={isSaving}
                          aria-label={`${media.filename} 삭제`}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">첨부된 미디어가 없어요.</p>
                  )}
                </div>
              )}
              <label className="dropzone">
                <strong>
                  {uploadItems.length
                    ? `${uploadItems.length}개의 파일을 추가로 선택했어요`
                    : editingMomentId
                      ? '사진 또는 동영상을 추가해 주세요'
                      : '사진 또는 동영상을 선택해 주세요'}
                </strong>
                <span>여러 파일 선택 가능 · JPG, PNG, WebP, MP4, MOV</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(event) => {
                    selectUploadFiles(Array.from(event.currentTarget.files ?? []));
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {uploadItems.length > 0 && (
                <div className="upload-list" aria-label="업로드할 파일 목록">
                  <div className="upload-summary">
                    {uploadItems.length}개 파일 · {uploadItems.filter((item) => item.status === 'done').length}개 업로드
                    완료
                  </div>
                  {uploadItems.map((item) => (
                    <div className="upload-item" key={item.id}>
                      {item.previewUrl &&
                        (item.file.type.startsWith('video/') ? (
                          <video src={item.previewUrl} muted preload="metadata" />
                        ) : (
                          <img src={item.previewUrl} alt="" />
                        ))}
                      <div className="upload-item-info">
                        <strong>{item.file.name}</strong>
                        <span>
                          {formatFileSize(item.file.size)} ·{' '}
                          {item.status === 'uploading'
                            ? `업로드 중 ${item.progress}%`
                            : item.status === 'done'
                              ? '업로드 완료'
                              : item.status === 'error'
                                ? '업로드 실패'
                                : '업로드 대기 중'}
                        </span>
                        {item.status === 'uploading' && (
                          <progress value={item.progress} max="100" aria-label={`${item.file.name} 업로드 진행률`} />
                        )}
                      </div>
                      <button
                        className="upload-remove"
                        type="button"
                        onClick={() => removeUploadItem(item.id)}
                        disabled={isSaving || item.status === 'uploading'}
                        aria-label={`${item.file.name} 업로드 목록에서 제거`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="form-actions">
                <button
                  className="button primary"
                  type="submit"
                  disabled={isSaving || !recordTitle.trim() || (!editingMomentId && uploadItems.length === 0)}
                >
                  {isSaving ? '저장하는 중…' : editingMomentId ? '기록 수정하기' : '기록 남기기'}
                </button>
                {editingMomentId && (
                  <button className="button secondary" type="button" onClick={resetMomentForm}>
                    취소
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {isEditingChild && (
          <section className="form-section child-edit-form">
            <h2>{isAddingChild ? '아이 추가' : '아이 정보 수정'}</h2>
            <form onSubmit={saveChild}>
              <label className="login-field">
                <span>이름 또는 태명</span>
                <input value={childName} onChange={(event) => setChildName(event.currentTarget.value)} required />
              </label>
              <div className="form-row">
                <label className="login-field">
                  <span>출산 예정일</span>
                  <input type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
                </label>
                <label className="login-field">
                  <span>태어난 날</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.currentTarget.value)} />
                </label>
              </div>
              <div className="form-actions">
                <button className="button primary" disabled={isSaving}>
                  아이 정보 저장
                </button>
                <button className="button secondary" type="button" onClick={() => setIsEditingChild(false)}>
                  취소
                </button>
              </div>
            </form>
          </section>
        )}

        {errorMessage && (
          <div className="error" role="alert">
            {errorMessage}{' '}
            <button className="retry-button" type="button" onClick={() => void loadTimeline()}>
              다시 시도
            </button>
          </div>
        )}
        <div className="section-heading">
          <div>
            <h2>{viewMode === 'timeline' ? '우리 가족의 타임라인' : '사진과 동영상'}</h2>
            <span className="section-count">
              {viewMode === 'timeline' ? `${timeline.moments.length}개의 기록` : `${galleryItems.length}개의 미디어`}
            </span>
          </div>
          <div className="view-switch" role="group" aria-label="앨범 보기 방식">
            <button
              className={viewMode === 'timeline' ? 'active' : ''}
              type="button"
              aria-pressed={viewMode === 'timeline'}
              onClick={() => setViewMode('timeline')}
            >
              기록
            </button>
            <button
              className={viewMode === 'gallery' ? 'active' : ''}
              type="button"
              aria-pressed={viewMode === 'gallery'}
              onClick={() => setViewMode('gallery')}
            >
              모아보기
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="empty-state skeleton">소중한 순간을 불러오고 있어요…</div>
        ) : viewMode === 'gallery' ? (
          galleryItems.length === 0 ? (
            <div className="empty-state">
              <div className="icon-box">✳</div>
              <h2>아직 모아볼 미디어가 없어요</h2>
              <p>사진이나 동영상을 올리면 이곳에 모여요.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {galleryItems.map((media) => {
                const fileUrl = `/media/${media.id}/file`;
                const isImage = imageTypes.has(media.contentType ?? '');
                const isVideo = videoTypes.has(media.contentType ?? '');
                const previewUrl = isImage ? `/media/${media.id}/thumbnail` : fileUrl;

                return (
                  <article className={`gallery-tile${isVideo ? ' video-gallery-tile' : ''}`} key={media.id}>
                    {isImage ? (
                      <button
                        className="gallery-image-button"
                        type="button"
                        onClick={() => openViewer(media, galleryItems)}
                        aria-label={`${media.filename} 크게 보기`}
                      >
                        <img src={previewUrl} alt={media.filename} loading="lazy" />
                      </button>
                    ) : isVideo ? (
                      <video src={fileUrl} controls preload="metadata" aria-label={media.filename} />
                    ) : null}
                    {isVideo && (
                      <span className="video-badge" aria-hidden="true">
                        ▶
                      </span>
                    )}
                    <span className="gallery-caption">
                      <span>{media.momentTitle}</span>
                      <time dateTime={media.occurredAt}>{formatDate(media.occurredAt)}</time>
                    </span>
                  </article>
                );
              })}
            </div>
          )
        ) : !timeline.moments.length ? (
          <div className="empty-state">
            <div className="icon-box">✳</div>
            <h2>첫 번째 추억을 기다리고 있어요</h2>
            <p>
              {userRole === 'admin'
                ? '작은 순간 하나로 우리 가족의 이야기를 시작해 보세요.'
                : '가족이 남겨줄 소중한 순간이 곧 이곳에 쌓일 거예요.'}
            </p>
            {userRole === 'admin' && timeline.child && (
              <button className="button primary" type="button" onClick={scrollToRecord}>
                첫 기록 남기기
              </button>
            )}
          </div>
        ) : (
          <div className="timeline-list">
            {Array.from(momentsByYear.entries()).map(([year, yearMoments]) => (
              <section key={year} className="timeline-year">
                <div className="year-label">
                  {year}
                  <span>OUR STORY</span>
                </div>
                {yearMoments.map((moment) => (
                  <article className="moment-card" key={moment.id}>
                    <div className="moment-top">
                      <span className="age-badge">
                        {timeline.child ? ageLabel(moment.occurredAt, timeline.child) : '소중한 하루'}
                      </span>
                      {userRole === 'admin' && (
                        <span className="moment-actions">
                          <button className="text-button" type="button" onClick={() => beginMomentEdit(moment)}>
                            수정
                          </button>
                          <button
                            className="text-button danger"
                            type="button"
                            onClick={() => void deleteMoment(moment.id)}
                          >
                            삭제
                          </button>
                        </span>
                      )}
                    </div>
                    <h2>{moment.title}</h2>
                    {moment.description && <p className="moment-description">{moment.description}</p>}
                    <div className={`media-grid${moment.media.length === 1 ? ' single' : ''}`}>
                      {moment.media.map((media) => {
                        const fileUrl = `/media/${media.id}/file`;
                        const previewUrl = imageTypes.has(media.contentType ?? '')
                          ? `/media/${media.id}/thumbnail`
                          : fileUrl;
                        return (
                          <button
                            className="media-tile"
                            type="button"
                            key={media.id}
                            onClick={() =>
                              (imageTypes.has(media.contentType ?? '') || videoTypes.has(media.contentType ?? '')) &&
                              openViewer(media, moment.media)
                            }
                          >
                            {imageTypes.has(media.contentType ?? '') ? (
                              <img src={previewUrl} alt={media.filename} loading="lazy" />
                            ) : videoTypes.has(media.contentType ?? '') ? (
                              <video src={fileUrl} controls preload="metadata" aria-label={media.filename} />
                            ) : (
                              <span>{media.filename}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <section className="comments" aria-label={`${moment.title} 댓글`}>
                      <div className="comments-heading">
                        <h3>댓글</h3>
                        <span>{moment.comments.length}개</span>
                      </div>
                      {moment.comments.map((comment) =>
                        editingCommentId === comment.id ? (
                          <form
                            className="comment-edit-form"
                            key={comment.id}
                            onSubmit={(event) => void updateComment(event, comment.id)}
                          >
                            <input
                              value={editingCommentAuthor}
                              onChange={(event) => setEditingCommentAuthor(event.currentTarget.value)}
                              maxLength={60}
                              aria-label="댓글 작성자"
                            />
                            <textarea
                              value={editingCommentContent}
                              onChange={(event) => setEditingCommentContent(event.currentTarget.value)}
                              maxLength={2000}
                              rows={2}
                              aria-label="댓글 내용"
                            />
                            <div className="comment-actions">
                              <button className="text-button" type="submit" disabled={isSavingComment}>
                                저장
                              </button>
                              <button className="text-button" type="button" onClick={() => setEditingCommentId(null)}>
                                취소
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="comment-item" key={comment.id}>
                            <div>
                              <strong>{comment.author}</strong>
                              <p>{comment.content}</p>
                            </div>
                            <span className="comment-actions">
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingCommentAuthor(comment.author);
                                  setEditingCommentContent(comment.content);
                                }}
                              >
                                수정
                              </button>
                              <button
                                className="text-button danger"
                                type="button"
                                onClick={() => void deleteComment(comment.id)}
                              >
                                삭제
                              </button>
                            </span>
                          </div>
                        ),
                      )}
                      <form className="comment-form" onSubmit={(event) => void addComment(event, moment.id)}>
                        <input
                          value={commentAuthor}
                          onChange={(event) => setCommentAuthor(event.currentTarget.value)}
                          placeholder="작성자"
                          maxLength={60}
                          required
                          aria-label="댓글 작성자"
                        />
                        <input
                          value={commentContent}
                          onChange={(event) => setCommentContent(event.currentTarget.value)}
                          placeholder="댓글을 남겨보세요"
                          maxLength={2000}
                          required
                          aria-label="댓글 내용"
                        />
                        <button className="button secondary" type="submit" disabled={isSavingComment}>
                          등록
                        </button>
                      </form>
                    </section>
                    <footer>
                      <time dateTime={moment.occurredAt}>{formatDay(moment.occurredAt)}</time>
                      <span>
                        {moment.media.length}개의 미디어 · {formatDate(moment.occurredAt)}
                      </span>
                    </footer>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
        {timeline.nextCursor && (
          <button
            className="button secondary load-more"
            type="button"
            disabled={isLoadingMore}
            onClick={() => void loadTimeline(timeline.nextCursor ?? undefined)}
          >
            {isLoadingMore ? '불러오는 중…' : '이전 순간 더 보기'}
          </button>
        )}

        {!timeline.moments.length && legacyMedia.length > 0 && (
          <section className="legacy-section">
            <div className="section-heading">
              <h2>기존 업로드</h2>
              <span>새 기록에 연결되지 않은 파일</span>
            </div>
            <div className="archive-grid">
              {legacyMedia.map((item) => (
                <article className="moment-card archive-card" key={item.id}>
                  <div className="media-item">
                    {imageTypes.has(item.contentType ?? '') ? (
                      <img src={`/media/${item.id}/thumbnail`} alt={item.filename} loading="lazy" />
                    ) : videoTypes.has(item.contentType ?? '') ? (
                      <video src={`/media/${item.id}/file`} controls preload="metadata" />
                    ) : (
                      <div className="media-placeholder">{item.filename}</div>
                    )}
                  </div>
                  <footer>
                    <span>{item.filename}</span>
                    <time>{formatDate(item.createdAt)}</time>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}
        <p className="album-footer">작은 날들, 오래 남을 이야기.</p>
      </main>
      {viewerMedia && (
        <div
          className="viewer-backdrop"
          role="dialog"
          aria-label={`${viewerMedia.filename} 크게 보기`}
          onClick={closeViewer}
        >
          <div
            className="viewer-panel"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={handleViewerTouchStart}
            onTouchEnd={handleViewerTouchEnd}
          >
            <button className="viewer-close" type="button" onClick={closeViewer} aria-label="확대 보기 닫기">
              ×
            </button>
            {viewerMediaItems.length > 1 && (
              <>
                <button
                  className="viewer-nav viewer-nav-previous"
                  type="button"
                  onClick={() => moveViewer(-1)}
                  disabled={viewerMediaItems.findIndex((media) => media.id === viewerMedia.id) === 0}
                  aria-label="이전 미디어"
                >
                  ‹
                </button>
                <button
                  className="viewer-nav viewer-nav-next"
                  type="button"
                  onClick={() => moveViewer(1)}
                  disabled={
                    viewerMediaItems.findIndex((media) => media.id === viewerMedia.id) === viewerMediaItems.length - 1
                  }
                  aria-label="다음 미디어"
                >
                  ›
                </button>
              </>
            )}
            {videoTypes.has(viewerMedia.contentType ?? '') ? (
              <video
                src={`/media/${viewerMedia.id}/file`}
                poster={viewerMedia.thumbnailContentType ? `/media/${viewerMedia.id}/thumbnail` : undefined}
                controls
                autoPlay
                preload="metadata"
                aria-label={viewerMedia.filename}
              />
            ) : isViewerThumbnailLoaded ? (
              <>
                <img
                  src={isViewerOriginalLoaded ? `/media/${viewerMedia.id}/file` : `/media/${viewerMedia.id}/thumbnail`}
                  alt={viewerMedia.filename}
                  decoding="async"
                />
                {!isViewerOriginalLoaded && <span className="viewer-loading">고화질 이미지를 불러오는 중…</span>}
              </>
            ) : (
              <span className="viewer-spinner" role="status" aria-label="이미지를 불러오는 중" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
