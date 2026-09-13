"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle, ArrowLeft, BookOpen, Brain, Check, CheckCircle2, ChevronRight, Circle, Cloud, FileText, Flame, FolderOpen, GraduationCap, Layers3, Library, LoaderCircle, LockKeyhole, LogIn, LogOut, Mail, Printer, RotateCcw, Save, ShieldCheck, Sparkles, Target, Trash2, UploadCloud, UserRound, X, Zap } from "lucide-react";
import { samplePack } from "@/lib/sample-pack";
import { isQuestionStyle, isRecord, parseStudyPack, type QuestionStyle, type StudyPack } from "@/lib/study-pack";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const STORE_KEY = "examsprint.last-pack.v1";
const MAX_BYTES = 4 * 1024 * 1024;
const processingSteps = ["Reading lecture material...", "Finding exam-worthy concepts...", "Removing low-value information...", "Building revision sheet...", "Generating practice questions..."];

interface StoredPack { pack: StudyPack; course: string; fileName: string; questionStyle: QuestionStyle; isSample: boolean; createdAt: string }
interface CramCard { label: string; title: string; body: string; secondary?: string; sourcePage: number | null }
interface StudyPackRow { id: string; user_id: string; title: string; subject: string; question_style: string; pdf_path: string | null; pack: unknown; quiz_score: number | null; created_at: string }
type AuthMode = "sign-in" | "sign-up";
type AuthIntent = "save" | "library" | null;
type CloudNotice = { tone: "success" | "error"; text: string };

function asStudyPackRow(value: unknown): StudyPackRow | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.user_id !== "string" || typeof value.title !== "string" || typeof value.subject !== "string" || typeof value.question_style !== "string" || typeof value.created_at !== "string") return null;
  if (value.pdf_path !== null && typeof value.pdf_path !== "string") return null;
  if (value.quiz_score !== null && typeof value.quiz_score !== "number") return null;
  return { id: value.id, user_id: value.user_id, title: value.title, subject: value.subject, question_style: value.question_style, pdf_path: value.pdf_path, pack: value.pack, quiz_score: value.quiz_score, created_at: value.created_at };
}

function safePdfName(name: string) {
  const normalized = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "lecture.pdf";
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}

function PageSource({ page, onOpen }: { page: number | null; onOpen?: (page: number) => void }) {
  if (!page) return null;
  return onOpen
    ? <button type="button" className="source-pill source-link" onClick={() => onOpen(page)} aria-label={`Open source page ${page}`}><FileText size={12} /> Source: Page {page}</button>
    : <span className="source-pill"><FileText size={12} /> Source: Page {page}</span>;
}

export default function ExamSprint() {
  const supabase = getSupabaseBrowserClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState("Operating Systems");
  const [questionStyle, setQuestionStyle] = useState<QuestionStyle>("University Theory");
  const [result, setResult] = useState<StoredPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePdfUrl, setSourcePdfUrl] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState<number | null>(null);
  const [cramOpen, setCramOpen] = useState(false);
  const [cramIndex, setCramIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authIntent, setAuthIntent] = useState<AuthIntent>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [libraryRows, setLibraryRows] = useState<StudyPackRow[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [cloudNotice, setCloudNotice] = useState<CloudNotice | null>(null);
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [currentPdfPath, setCurrentPdfPath] = useState<string | null>(null);
  const [cloudPdfUrl, setCloudPdfUrl] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const stored: unknown = JSON.parse(raw);
      if (!isRecord(stored) || typeof stored.course !== "string" || typeof stored.fileName !== "string" || typeof stored.createdAt !== "string" || typeof stored.isSample !== "boolean" || !isQuestionStyle(stored.questionStyle)) throw new Error("Invalid saved pack");
      setResult({ pack: parseStudyPack(stored.pack), course: stored.course.slice(0, 120), fileName: stored.fileName.slice(0, 240), questionStyle: stored.questionStyle, isSample: stored.isSample, createdAt: stored.createdAt });
      setCourse(stored.course.slice(0, 120));
      setQuestionStyle(stored.questionStyle);
    } catch { localStorage.removeItem(STORE_KEY); }
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) { setUser(data.user ?? null); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!sourceFile) { setSourcePdfUrl(null); return; }
    const objectUrl = URL.createObjectURL(sourceFile);
    setSourcePdfUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceFile]);

  function chooseFile(next: File | undefined) {
    setError("");
    if (!next) return;
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) { setFile(null); setError("Choose a PDF lecture file."); return; }
    if (next.size > MAX_BYTES) { setFile(null); setError("That PDF is over 4 MB. Choose a smaller lecture file for the online demo."); return; }
    if (next.size === 0) { setFile(null); setError("That PDF is empty. Choose another file."); return; }
    setFile(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]);
  }

  function store(next: StoredPack) {
    setResult(next); setAnswers({}); setActiveQuestion(0); setSourcePage(null); setCramOpen(false); setCramIndex(0);
    setCurrentSavedId(null); setCurrentPdfPath(null); setCloudPdfUrl(null); setSaveStatus("idle"); setCloudNotice(null);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* The current session remains usable. */ }
  }

  function loadSample() {
    setError(""); setCourse("Operating Systems"); setQuestionStyle("University Theory");
    setSourceFile(null);
    store({ pack: samplePack, course: "Operating Systems", fileName: "OS_Process_Management_Lecture.pdf", questionStyle: "University Theory", isSample: true, createdAt: new Date().toISOString() });
    requestAnimationFrame(() => document.getElementById("revision-pack")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function buildPack() {
    if (!file || course.trim().length < 2 || busy) return;
    setBusy(true); setError(""); setElapsed(0);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort("timeout"), 55000);
    try {
      const form = new FormData(); form.append("file", file); form.append("course", course.trim()); form.append("questionStyle", questionStyle);
      const response = await fetch("/api/study-pack", { method: "POST", body: form, signal: abort.signal });
      let data: unknown;
      try { data = await response.json(); } catch { throw new Error("The server returned an unreadable response. Please try again."); }
      if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "We couldn’t build this revision pack. Please try again.");
      let pack: StudyPack;
      try { pack = parseStudyPack(isRecord(data) ? data.pack : null); } catch { throw new Error("The AI response was incomplete. Please try again; your previous pack is safe."); }
      store({ pack, course: course.trim(), fileName: file.name, questionStyle, isSample: false, createdAt: new Date().toISOString() });
      setSourceFile(file);
      requestAnimationFrame(() => document.getElementById("revision-pack")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (problem) {
      if (abort.signal.aborted) setError(abort.signal.reason === "cancel" ? "Processing canceled. Your previous revision pack is safe." : "Processing took too long. Try a shorter PDF or use the sample lecture.");
      else setError(problem instanceof Error ? problem.message : "Something went wrong. Please try again.");
    } finally { clearTimeout(timeout); controller.current = null; setBusy(false); }
  }

  const completedSteps = Math.min(4, Math.floor(elapsed / 6));
  const answeredCount = Object.keys(answers).length;
  const score = Object.entries(answers).filter(([index, answer]) => result && result.pack.quiz[Number(index)].correctIndex === answer).length;
  const scoreMessage = score === 5 ? "Excellent — you nailed this lecture." : score === 4 ? "Almost exam-ready." : score === 3 ? "Good start — review the key concepts once more." : "Take another quick revision pass and retry.";
  const cramCards: CramCard[] = result ? [
    { label: "60-SECOND REVISION", title: result.pack.title, body: result.pack.summary, sourcePage: null },
    ...result.pack.highYieldTopics.map(item => ({ label: `${item.importance.toUpperCase()}-YIELD CONCEPT`, title: item.topic, body: item.explanation, sourcePage: item.sourcePage })),
    ...result.pack.mustRemember.map((item, index) => ({ label: `MUST REMEMBER ${String(index + 1).padStart(2, "0")}`, title: "Lock this in", body: item.text, sourcePage: item.sourcePage })),
    ...result.pack.commonTraps.map(trap => ({ label: "COMMON TRAP", title: trap.mistake, body: trap.correction, secondary: "Correct understanding", sourcePage: null })),
  ] : [];

  useEffect(() => {
    if (!sourcePage && !cramOpen && !authOpen && !libraryOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (sourcePage) setSourcePage(null);
        else if (authOpen) setAuthOpen(false);
        else if (libraryOpen) setLibraryOpen(false);
        else setCramOpen(false);
      } else if (cramOpen && !sourcePage && event.key === "ArrowRight") {
        setCramIndex(index => Math.min(cramCards.length, index + 1));
      } else if (cramOpen && !sourcePage && event.key === "ArrowLeft") {
        setCramIndex(index => Math.max(0, index - 1));
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [authOpen, cramCards.length, cramOpen, libraryOpen, sourcePage]);

  const activePdfUrl = sourcePdfUrl || cloudPdfUrl;

  function openAuth(intent: AuthIntent = null) {
    setAuthIntent(intent); setAuthMode("sign-in"); setAuthError(""); setAuthMessage(""); setAuthPassword(""); setAuthOpen(true);
  }

  async function getVerifiedUser() {
    if (!supabase) throw new Error("Cloud accounts are not configured for this deployment.");
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) throw new Error("Sign in to use your revision library.");
    return data.user;
  }

  async function submitAuth() {
    if (!supabase) { setAuthError("Cloud accounts are not configured for this deployment."); return; }
    if (!authEmail.trim() || authPassword.length < 6) { setAuthError("Enter a valid email and a password with at least 6 characters."); return; }
    setAuthBusy(true); setAuthError(""); setAuthMessage("");
    try {
      if (authMode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (signUpError) throw signUpError;
        if (!data.session) { setAuthMessage("Account created. Check your email to confirm it, then sign in."); setAuthMode("sign-in"); return; }
        setUser(data.user); setAuthOpen(false);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (signInError) throw signInError;
        setUser(data.user); setAuthOpen(false);
      }
      const intent = authIntent;
      setAuthIntent(null); setAuthPassword("");
      if (intent === "save") await saveCurrentToLibrary();
      if (intent === "library") await loadLibrary();
    } catch (authProblem) {
      const message = authProblem instanceof Error ? authProblem.message.toLowerCase() : "";
      setAuthError(message.includes("invalid login") ? "Email or password is incorrect." : message.includes("already registered") ? "An account already exists for this email. Try signing in." : "Authentication failed. Check your details and try again.");
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    setCloudNotice(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) { setCloudNotice({ tone: "error", text: "Couldn’t sign out. Please try again." }); return; }
    setUser(null); setLibraryOpen(false); setLibraryRows([]); setCurrentSavedId(null); setCurrentPdfPath(null); setCloudPdfUrl(null); setSaveStatus("idle");
  }

  async function saveCurrentToLibrary() {
    if (!result || saveStatus === "saving" || currentSavedId) return;
    if (!supabase) { setCloudNotice({ tone: "error", text: "Cloud accounts are not configured for this deployment." }); return; }
    let uploadedPath: string | null = null;
    setSaveStatus("saving"); setCloudNotice(null);
    try {
      const verified = await getVerifiedUser();
      if (sourceFile) {
        uploadedPath = `${verified.id}/${crypto.randomUUID()}-${safePdfName(sourceFile.name)}`;
        const { error: uploadError } = await supabase.storage.from("lecture-pdfs").upload(uploadedPath, sourceFile, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw new Error("The original PDF could not be stored. Check your storage policy and try again.");
      }
      const { data, error: insertError } = await supabase.from("study_packs").insert({
        user_id: verified.id,
        title: result.pack.title,
        subject: result.course,
        question_style: result.questionStyle,
        pdf_path: uploadedPath,
        pack: result.pack,
        quiz_score: answeredCount === 5 ? score : null,
        created_at: new Date().toISOString(),
      }).select("id").single();
      if (insertError || !isRecord(data) || typeof data.id !== "string") {
        if (uploadedPath) await supabase.storage.from("lecture-pdfs").remove([uploadedPath]);
        throw new Error("The revision pack could not be saved. Check your table policy and try again.");
      }
      setCurrentSavedId(data.id); setCurrentPdfPath(uploadedPath); setSaveStatus("saved");
      setCloudNotice({ tone: "success", text: "Saved to My Library ✓" });
    } catch (saveProblem) {
      setSaveStatus("idle");
      if (saveProblem instanceof Error && saveProblem.message.includes("Sign in")) { openAuth("save"); return; }
      setCloudNotice({ tone: "error", text: saveProblem instanceof Error ? saveProblem.message : "Couldn’t save this revision pack. Please try again." });
    }
  }

  async function loadLibrary() {
    if (!supabase) { setCloudNotice({ tone: "error", text: "Cloud accounts are not configured for this deployment." }); return; }
    setLibraryOpen(true); setLibraryBusy(true); setLibraryError("");
    try {
      const verified = await getVerifiedUser();
      const { data, error: loadError } = await supabase.from("study_packs").select("id,user_id,title,subject,question_style,pdf_path,pack,quiz_score,created_at").eq("user_id", verified.id).order("created_at", { ascending: false });
      if (loadError) throw loadError;
      setLibraryRows(Array.isArray(data) ? data.map(asStudyPackRow).filter((row): row is StudyPackRow => row !== null && row.user_id === verified.id) : []);
    } catch (loadProblem) {
      if (loadProblem instanceof Error && loadProblem.message.includes("Sign in")) { setLibraryOpen(false); openAuth("library"); return; }
      setLibraryError("Couldn’t load your library. Check your connection and try again.");
    } finally { setLibraryBusy(false); }
  }

  function openSavedPack(row: StudyPackRow) {
    try {
      if (!isQuestionStyle(row.question_style)) throw new Error("Invalid question style");
      const pack = parseStudyPack(row.pack);
      setSourceFile(null);
      store({ pack, course: row.subject.slice(0, 120), fileName: row.pdf_path?.split("/").pop() || "Saved revision pack", questionStyle: row.question_style, isSample: false, createdAt: row.created_at });
      setCurrentSavedId(row.id); setCurrentPdfPath(row.pdf_path); setSaveStatus("saved"); setLibraryOpen(false);
      requestAnimationFrame(() => document.getElementById("revision-pack")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch { setLibraryError("This saved pack is incomplete and can’t be opened safely."); }
  }

  async function deleteSavedPack(row: StudyPackRow) {
    if (!supabase || !window.confirm(`Delete “${row.title}” from My Library? This cannot be undone.`)) return;
    setDeletingId(row.id); setLibraryError("");
    try {
      const verified = await getVerifiedUser();
      if (row.user_id !== verified.id) throw new Error("This revision pack does not belong to the signed-in account.");
      if (row.pdf_path) {
        const { error: storageError } = await supabase.storage.from("lecture-pdfs").remove([row.pdf_path]);
        if (storageError) throw new Error("The stored PDF could not be deleted, so the revision pack was kept.");
      }
      const { error: deleteError } = await supabase.from("study_packs").delete().eq("id", row.id).eq("user_id", verified.id);
      if (deleteError) throw deleteError;
      setLibraryRows(rows => rows.filter(item => item.id !== row.id));
      if (currentSavedId === row.id) { setCurrentSavedId(null); setCurrentPdfPath(null); setCloudPdfUrl(null); setSaveStatus("idle"); }
    } catch (deleteProblem) { setLibraryError(deleteProblem instanceof Error ? deleteProblem.message : "Couldn’t delete this revision pack. Please try again."); }
    finally { setDeletingId(null); }
  }

  async function openSource(page: number) {
    setSourcePage(page); setSourceError("");
    if (sourcePdfUrl || cloudPdfUrl || !currentPdfPath) return;
    if (!supabase) { setSourceError("Cloud PDF access is not configured for this deployment."); return; }
    setSourceLoading(true);
    try {
      await getVerifiedUser();
      const { data, error: signedUrlError } = await supabase.storage.from("lecture-pdfs").createSignedUrl(currentPdfPath, 600);
      if (signedUrlError || !data?.signedUrl) throw signedUrlError || new Error("Missing signed URL");
      setCloudPdfUrl(data.signedUrl);
    } catch { setSourceError("The saved lecture PDF could not be opened. Sign in again or retry later."); }
    finally { setSourceLoading(false); }
  }

  useEffect(() => {
    if (!sourcePage || sourcePdfUrl || cloudPdfUrl || !currentPdfPath) return;
    void openSource(sourcePage);
  }, [cloudPdfUrl, currentPdfPath, sourcePage, sourcePdfUrl]);

  useEffect(() => {
    if (!supabase || !user || !currentSavedId || answeredCount !== 5) return;
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active || data.user?.id !== user.id) return;
      await supabase.from("study_packs").update({ quiz_score: score }).eq("id", currentSavedId).eq("user_id", data.user.id);
    });
    return () => { active = false; };
  }, [answeredCount, currentSavedId, score, supabase, user]);

  function retryQuiz() { setAnswers({}); setActiveQuestion(0); }
  function goToQuiz() {
    setCramOpen(false);
    requestAnimationFrame(() => document.getElementById("practice-quiz")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function exportPack() {
    if (!result) return;
    const originalTitle = document.title;
    document.title = `${result.pack.title} - ExamSprint AI Revision Pack`;
    const restoreTitle = () => { document.title = originalTitle; window.removeEventListener("afterprint", restoreTitle); };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  }

  return <div className="site-shell">
    <header className="app-header">
      <a className="logo" href="/" aria-label="ExamSprint AI home"><span><GraduationCap size={24} /></span><strong>ExamSprint</strong><em>AI</em></a>
      <div className="header-status"><span className="online-dot" /> Gemini-powered <span className="header-divider" /> Revision packs save on this device</div>
      <div className="header-actions"><button className="sample-button" onClick={loadSample} disabled={busy}><Zap size={15} /> Try Sample Lecture</button>{user ? <><button className="library-button" onClick={() => void loadLibrary()}><Library size={15} /> My Library</button><span className="account-email"><UserRound size={14} /> {user.email}</span><button className="account-icon-button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></> : <button className="library-button" onClick={() => openAuth(null)} disabled={!authReady}><LogIn size={15} /> Sign in</button>}</div>
    </header>

    <main className="workspace">
      <section className="intro">
        <div className="intro-copy"><div className="eyebrow"><Sparkles size={13} /> YOUR REVISION COPILOT</div><h1>Turn lectures into<br /><span>revision in seconds.</span></h1><p>Upload a lecture PDF. Get the concepts that matter, the facts worth remembering, and five grounded questions to test yourself.</p></div>
        <div className="trust-strip"><div><ShieldCheck size={17} /><span><strong>Grounded in your PDF</strong><small>No outside material</small></span></div><div><Target size={17} /><span><strong>Exam-focused</strong><small>High-yield only</small></span></div><div><Brain size={17} /><span><strong>Active recall</strong><small>Exactly 5 questions</small></span></div></div>
      </section>

      <section className="builder-card" aria-labelledby="upload-heading">
        <div className="builder-heading"><div><span className="section-number">01</span><div><h2 id="upload-heading">Build your revision pack</h2><p>One lecture in. Everything you need to revise, out.</p></div></div><span className="pdf-only">PDF · MAX 4 MB</span></div>
        <div className="builder-grid">
          <div className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} aria-label="Upload lecture PDF">
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={event => chooseFile(event.target.files?.[0])} />
            {file ? <><span className="file-icon"><FileText size={29} /></span><div className="file-details"><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to study</small></div><button className="remove-file" aria-label="Remove PDF" onClick={event => { event.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}><X size={18} /></button></> : <><span className="upload-icon"><UploadCloud size={29} /></span><h3>Drop your lecture PDF here</h3><p>or <span>browse your files</span></p><small>Text-based and scanned lecture PDFs supported</small></>}
          </div>
          <div className="setup-fields">
            <label htmlFor="course">Subject / Course<input id="course" value={course} onChange={event => setCourse(event.target.value)} maxLength={120} placeholder="e.g. Operating Systems" disabled={busy} /></label>
            <fieldset><legend>Question style</legend><div className="style-options">{(["University Theory", "MCQ", "Placement / Interview"] as QuestionStyle[]).map((style, index) => <button type="button" key={style} aria-pressed={questionStyle === style} className={questionStyle === style ? "active" : ""} onClick={() => setQuestionStyle(style)} disabled={busy}><span>{index === 0 ? <BookOpen size={16} /> : index === 1 ? <Layers3 size={16} /> : <Brain size={16} />}</span>{style}{questionStyle === style && <Check size={14} />}</button>)}</div></fieldset>
          </div>
        </div>
        {error && <div className="error-banner" role="alert"><AlertTriangle size={18} /><div><strong>Couldn’t build the pack</strong><p>{error}</p></div><button onClick={loadSample}>Try sample <ChevronRight size={14} /></button></div>}
        <div className="builder-actions"><button className="primary-button" disabled={!file || course.trim().length < 2 || busy} onClick={() => void buildPack()}>{busy ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}{busy ? "Building your revision pack..." : "Build My Revision Pack"}<ChevronRight size={18} /></button><button className="text-action" onClick={loadSample} disabled={busy}><Zap size={14} /> No PDF handy? Try Sample Lecture</button></div>
      </section>

      {busy && <section className="processing-card" aria-live="polite">
        <div className="scan-visual"><div className="page-stack one" /><div className="page-stack two" /><div className="scan-page"><FileText size={36} /><span /></div></div>
        <div className="processing-copy"><span className="section-number">GEMINI IS STUDYING</span><h2>Turning pages into progress.</h2><p>We’re reading your lecture and keeping every insight grounded in the source.</p><div className="process-list">{processingSteps.map((step, index) => <div className={index <= completedSteps ? "active" : ""} key={step}>{index < completedSteps ? <CheckCircle2 size={19} /> : index === completedSteps ? <LoaderCircle className="spin" size={19} /> : <Circle size={19} />}<span>{step}</span></div>)}</div><div className="processing-progress"><span style={{ width: `${Math.min(94, 12 + elapsed * 2.4)}%` }} /></div><small>{elapsed}s elapsed · usually ready in under a minute</small><button className="cancel-button" onClick={() => controller.current?.abort("cancel")}>Cancel</button></div>
      </section>}

      {result && !busy && <section id="revision-pack" className="revision-pack">
        <div className="pack-header">
          <div className="print-brand print-only"><span><GraduationCap size={21} /></span><strong>ExamSprint AI</strong><em>Revision Pack</em></div>
          <div className="pack-header-actions"><button className="back-button" onClick={() => document.querySelector(".builder-card")?.scrollIntoView({ behavior: "smooth" })}><ArrowLeft size={15} /> New lecture</button><div className="pack-action-group"><button className={`save-library-button ${saveStatus === "saved" || currentSavedId ? "saved" : ""}`} onClick={() => user ? void saveCurrentToLibrary() : openAuth("save")} disabled={saveStatus === "saving" || Boolean(currentSavedId)}>{saveStatus === "saving" ? <LoaderCircle className="spin" size={16} /> : saveStatus === "saved" || currentSavedId ? <Check size={16} /> : <Save size={16} />}{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" || currentSavedId ? "Saved to My Library" : "Save to My Library"}</button><button className="cram-button" onClick={() => { setCramIndex(0); setCramOpen(true); }}><Brain size={16} /> Start Cram Mode</button><button className="export-button" onClick={exportPack}><Printer size={16} /> Export Revision Pack</button></div></div>
          <div className="pack-title"><div><span className={`result-badge ${result.isSample ? "sample" : ""}`}><Sparkles size={12} /> {result.isSample ? "SAMPLE REVISION PACK" : "AI REVISION PACK"}</span><h2>{result.pack.title}</h2><p>{result.course} <span>·</span> {result.questionStyle} <span>·</span> {result.fileName}</p></div><div className="pack-score"><strong>{answeredCount}<span>/5</span></strong><small>questions answered</small></div></div>
        </div>
        {cloudNotice && <div className={`cloud-notice ${cloudNotice.tone}`} role="status">{cloudNotice.tone === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{cloudNotice.text}</span><button onClick={() => setCloudNotice(null)} aria-label="Dismiss"><X size={14} /></button></div>}

        <div className="pack-layout">
          <div className="pack-main">
            <section className="content-section high-yield"><div className="content-heading"><span className="heading-icon fire"><Flame size={18} /></span><div><span>01 · PRIORITY TOPICS</span><h3>High-Yield Concepts</h3></div><small>{result.pack.highYieldTopics.length} concepts</small></div><div className="concept-grid">{result.pack.highYieldTopics.map((item, index) => <article key={`${item.topic}-${index}`}><div className="concept-top"><span>{String(index + 1).padStart(2, "0")}</span><span className={`importance ${item.importance}`}>{item.importance} yield</span></div><h4>{item.topic}</h4><p>{item.explanation}</p><PageSource page={item.sourcePage} onOpen={setSourcePage} /></article>)}</div></section>

            <section className="content-section quick-revision"><div className="content-heading"><span className="heading-icon bolt"><Zap size={18} /></span><div><span>02 · RAPID RECALL</span><h3>60-Second Revision</h3></div></div><div className="summary-callout"><span className="quote">“</span><p>{result.pack.summary}</p></div><div className="rapid-list">{result.pack.highYieldTopics.slice(0, 5).map((item, index) => <div key={item.topic}><CheckCircle2 size={16} /><p><strong>{item.topic}:</strong> {item.explanation}</p><span>{String(index + 1).padStart(2, "0")}</span></div>)}</div></section>

            <section className="content-section"><div className="content-heading"><span className="heading-icon remember"><Brain size={18} /></span><div><span>03 · LOCK IT IN</span><h3>Must Remember</h3></div><small>{result.pack.mustRemember.length} essentials</small></div><div className="remember-list">{result.pack.mustRemember.map((item, index) => <article key={index}><span className="remember-number">{String(index + 1).padStart(2, "0")}</span><p>{item.text}</p><PageSource page={item.sourcePage} onOpen={setSourcePage} /></article>)}</div></section>

            <section className="content-section traps"><div className="content-heading"><span className="heading-icon warning"><AlertTriangle size={18} /></span><div><span>04 · DON’T LOSE MARKS</span><h3>Common Traps</h3></div></div><div className="trap-list">{result.pack.commonTraps.map((trap, index) => <article key={index}><div className="trap-side"><X size={15} /><span>COMMON MISTAKE</span><p>{trap.mistake}</p></div><ChevronRight size={19} /><div className="trap-side correction"><Check size={15} /><span>GET IT RIGHT</span><p>{trap.correction}</p></div></article>)}</div></section>

            <section id="practice-quiz" className="content-section quiz-section">
              <div className="content-heading"><span className="heading-icon quiz"><Target size={18} /></span><div><span>05 · TEST YOURSELF</span><h3>Practice Quiz</h3></div><small>{answeredCount === 5 ? `${score}/5 correct` : `${answeredCount}/5 answered`}</small></div>
              <div className="quiz-progress" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount * 20}%` }} /></div>
              <div className="question-tabs">{result.pack.quiz.map((question, index) => <button key={index} onClick={() => setActiveQuestion(index)} aria-label={`Question ${index + 1}`} className={`${activeQuestion === index ? "active" : ""} ${answers[index] !== undefined ? (answers[index] === question.correctIndex ? "correct" : "wrong") : ""}`}>{answers[index] !== undefined ? answers[index] === question.correctIndex ? <Check size={14} /> : <X size={14} /> : index + 1}</button>)}</div>
              {result.pack.quiz.map((question, questionIndex) => questionIndex === activeQuestion && <article className="question-card" key={questionIndex}>
                <div className="question-meta"><span>QUESTION {questionIndex + 1} OF 5</span><PageSource page={question.sourcePage} onOpen={setSourcePage} /></div>
                <h4>{question.question}</h4>
                <div className="options">{question.options.map((option, optionIndex) => { const answered = answers[questionIndex] !== undefined; const selected = answers[questionIndex] === optionIndex; const correct = question.correctIndex === optionIndex; return <button key={optionIndex} disabled={answered} onClick={() => setAnswers(previous => ({ ...previous, [questionIndex]: optionIndex }))} className={`${selected ? "selected" : ""} ${answered && correct ? "correct" : ""} ${answered && selected && !correct ? "wrong" : ""}`}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option}</p>{answered && correct && <CheckCircle2 size={18} />}{answered && selected && !correct && <X size={18} />}</button>; })}</div>
                {answers[questionIndex] !== undefined && <div className={`answer-panel ${answers[questionIndex] === question.correctIndex ? "correct" : "wrong"}`}><div className="answer-status">{answers[questionIndex] === question.correctIndex ? <CheckCircle2 size={21} /> : <X size={21} />}<strong>{answers[questionIndex] === question.correctIndex ? "Correct" : "Incorrect"}</strong></div><p><span>Correct answer</span>{String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}</p><p><span>Why</span>{question.explanation}</p><PageSource page={question.sourcePage} onOpen={setSourcePage} /></div>}
                <div className="quiz-nav"><button disabled={questionIndex === 0} onClick={() => setActiveQuestion(questionIndex - 1)}><ArrowLeft size={14} /> Previous</button>{questionIndex < 4 ? <button onClick={() => setActiveQuestion(questionIndex + 1)}>Next question <ChevronRight size={14} /></button> : null}</div>
              </article>)}
              {answeredCount === 5 && <div className="quiz-complete" aria-live="polite"><span className="quiz-complete-icon"><CheckCircle2 size={25} /></span><div className="quiz-complete-copy"><span>REVISION CHECK COMPLETE</span><h4>{score} <small>/ 5</small></h4><strong>{score * 20}%</strong><p>{scoreMessage}</p></div><button type="button" onClick={retryQuiz}><RotateCcw size={15} /> Retry Quiz</button></div>}
            </section>

            <section className="print-quiz print-only" aria-hidden="true">
              <div className="print-section-title"><span>05</span><div><small>TEST YOURSELF</small><h3>Practice Quiz &amp; Answer Key</h3></div></div>
              {result.pack.quiz.map((question, questionIndex) => <article className="print-question" key={questionIndex}>
                <div className="print-question-heading"><span>Question {questionIndex + 1} of 5</span><PageSource page={question.sourcePage} /></div>
                <h4>{question.question}</h4>
                <ol type="A">{question.options.map((option, optionIndex) => <li key={optionIndex} className={optionIndex === question.correctIndex ? "correct-option" : ""}>{option}</li>)}</ol>
                <div className="print-answer"><p><strong>Correct answer:</strong> {String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}</p><p><strong>Explanation:</strong> {question.explanation}</p></div>
              </article>)}
            </section>
          </div>

          <aside className="pack-sidebar"><div className="study-status"><div className="status-ring" style={{ background: `conic-gradient(#a98cff ${answeredCount * 72}deg, #292934 0deg)` }}><span>{answeredCount * 20}%</span></div><div><span>QUIZ PROGRESS</span><strong>{answeredCount === 5 ? `${score} correct` : `${5 - answeredCount} to go`}</strong></div></div><nav aria-label="Revision pack sections"><a href="#revision-pack"><Flame size={15} /> High-Yield Concepts</a><a href="#revision-pack"><Zap size={15} /> 60-Second Revision</a><a href="#revision-pack"><Brain size={15} /> Must Remember</a><a href="#revision-pack"><AlertTriangle size={15} /> Common Traps</a><a href="#revision-pack"><Target size={15} /> Practice Quiz</a></nav><div className="grounding-card"><ShieldCheck size={20} /><h4>Source grounded</h4><p>Every insight comes from the uploaded lecture. Page references help you verify the material.</p></div></aside>
        </div>
      </section>}
    </main>
    <footer><span>ExamSprint AI</span><p>Study the signal. Skip the noise.</p><span>Powered by Gemini</span></footer>

    {authOpen && <div className="auth-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <header><div><span><Cloud size={19} /></span><div><strong id="auth-title">{authMode === "sign-in" ? "Sign in to ExamSprint" : "Create your account"}</strong><small>Your study flow always works without an account.</small></div></div><button type="button" onClick={() => setAuthOpen(false)} aria-label="Close account dialog"><X size={20} /></button></header>
        <div className="auth-tabs"><button type="button" className={authMode === "sign-in" ? "active" : ""} onClick={() => { setAuthMode("sign-in"); setAuthError(""); setAuthMessage(""); }}>Sign In</button><button type="button" className={authMode === "sign-up" ? "active" : ""} onClick={() => { setAuthMode("sign-up"); setAuthError(""); setAuthMessage(""); }}>Sign Up</button></div>
        <form onSubmit={event => { event.preventDefault(); void submitAuth(); }}><label><span>Email</span><div><Mail size={16} /><input type="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label><label><span>Password</span><div><LockKeyhole size={16} /><input type="password" value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={authMode === "sign-in" ? "current-password" : "new-password"} minLength={6} required /></div></label>{authError && <p className="auth-feedback error"><AlertTriangle size={15} /> {authError}</p>}{authMessage && <p className="auth-feedback success"><CheckCircle2 size={15} /> {authMessage}</p>}<button className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : authMode === "sign-in" ? <LogIn size={17} /> : <UserRound size={17} />}{authBusy ? "Please wait..." : authMode === "sign-in" ? "Sign In" : "Create Account"}</button></form>
        <p className="auth-guest-note">Guest mode stays available. Signing in only enables private cloud storage and cross-device history.</p>
      </section>
    </div>}

    {libraryOpen && <div className="library-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setLibraryOpen(false); }}>
      <section className="library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <header><div><span><Library size={20} /></span><div><strong id="library-title">My Library</strong><small>{user?.email} · newest first</small></div></div><button type="button" onClick={() => setLibraryOpen(false)} aria-label="Close library"><X size={20} /></button></header>
        <div className="library-content">{libraryError && <div className="library-error"><AlertTriangle size={16} /> {libraryError}<button onClick={() => void loadLibrary()}>Retry</button></div>}{libraryBusy ? <div className="library-empty"><LoaderCircle className="spin" size={29} /><h3>Loading your revision packs…</h3></div> : libraryRows.length === 0 ? <div className="library-empty"><span><Library size={30} /></span><h3>Your library is ready</h3><p>Save a generated revision pack and it will appear here across your devices.</p></div> : <div className="library-grid">{libraryRows.map(row => <article key={row.id}><div className="library-card-top"><span><FileText size={17} /></span><small>{new Date(row.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</small></div><h3>{row.title}</h3><p>{row.subject} <span>·</span> {row.question_style}</p><div className="library-card-meta"><span>{row.quiz_score === null ? "Quiz not completed" : `${row.quiz_score}/5 quiz score`}</span><span>{row.pdf_path ? "PDF stored privately" : "Notes only"}</span></div><div className="library-card-actions"><button type="button" onClick={() => openSavedPack(row)}><FolderOpen size={15} /> Open</button><button type="button" className="delete" onClick={() => void deleteSavedPack(row)} disabled={deletingId === row.id}>{deletingId === row.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Delete</button></div></article>)}</div>}</div>
      </section>
    </div>}

    {cramOpen && result && <div className="cram-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setCramOpen(false); }}>
      <section className="cram-shell" role="dialog" aria-modal="true" aria-labelledby="cram-title">
        <header className="cram-header"><div><span><Brain size={17} /></span><div><strong id="cram-title">Cram Mode</strong><small>{result.course}</small></div></div><button type="button" onClick={() => setCramOpen(false)} aria-label="Close Cram Mode"><X size={20} /></button></header>
        <div className="cram-progress"><span style={{ width: `${((Math.min(cramIndex, cramCards.length) + 1) / (cramCards.length + 1)) * 100}%` }} /></div>
        {cramIndex < cramCards.length ? <div className="cram-stage">
          <div className="cram-count">{cramIndex + 1} / {cramCards.length}</div>
          <article className="cram-card"><span>{cramCards[cramIndex].label}</span><h2>{cramCards[cramIndex].title}</h2>{cramCards[cramIndex].secondary && <small>{cramCards[cramIndex].secondary}</small>}<p>{cramCards[cramIndex].body}</p><PageSource page={cramCards[cramIndex].sourcePage} onOpen={setSourcePage} /></article>
        </div> : <div className="cram-stage cram-finish"><span className="cram-finish-icon"><Target size={30} /></span><small>REVISION PASS COMPLETE</small><h2>Ready to test your recall?</h2><p>You’ve reviewed the condensed notes. Finish with the five-question practice quiz.</p><button type="button" onClick={goToQuiz}><Target size={17} /> Go to Practice Quiz</button></div>}
        <footer className="cram-nav"><button type="button" onClick={() => setCramIndex(index => Math.max(0, index - 1))} disabled={cramIndex === 0}><ArrowLeft size={16} /> Previous</button><span>Use ← → keys to move · Esc to close</span>{cramIndex < cramCards.length ? <button type="button" onClick={() => setCramIndex(index => Math.min(cramCards.length, index + 1))}>Next <ChevronRight size={16} /></button> : <button type="button" onClick={goToQuiz}>Quiz <ChevronRight size={16} /></button>}</footer>
      </section>
    </div>}

    {sourcePage && <div className="source-lens-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSourcePage(null); }}>
      <section className="source-lens" role="dialog" aria-modal="true" aria-labelledby="source-lens-title">
        <header><div><span><FileText size={19} /></span><div><strong id="source-lens-title">Source Lens</strong><small>Viewing original lecture — Page {sourcePage}</small></div></div><button type="button" onClick={() => setSourcePage(null)} aria-label="Close Source Lens"><X size={20} /></button></header>
        {sourceLoading ? <div className="source-unavailable"><LoaderCircle className="spin" size={34} /><h3>Opening saved lecture…</h3><p>Creating a temporary private link for this PDF.</p></div> : activePdfUrl && !result?.isSample ? <iframe key={`${activePdfUrl}-${sourcePage}`} src={`${activePdfUrl}#page=${sourcePage}&view=FitH`} title={`Original lecture PDF at page ${sourcePage}`} /> : <div className="source-unavailable"><span><FileText size={31} /></span><h3>Original lecture not attached</h3><p>{sourceError || "Original PDF preview is available for uploaded lectures."}</p></div>}
        <footer><span>Page {sourcePage}</span>{activePdfUrl && !result?.isSample ? <a href={`${activePdfUrl}#page=${sourcePage}`} target="_blank" rel="noreferrer">Open full document <ChevronRight size={14} /></a> : null}</footer>
      </section>
    </div>}
  </div>;
}
