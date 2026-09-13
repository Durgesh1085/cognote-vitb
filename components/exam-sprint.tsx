"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, Brain, Check, CheckCircle2, ChevronRight, Circle, FileText, Flame, GraduationCap, Layers3, LoaderCircle, Printer, RotateCcw, ShieldCheck, Sparkles, Target, UploadCloud, X, Zap } from "lucide-react";
import { samplePack } from "@/lib/sample-pack";
import { isQuestionStyle, isRecord, parseStudyPack, type QuestionStyle, type StudyPack } from "@/lib/study-pack";

const STORE_KEY = "examsprint.last-pack.v1";
const MAX_BYTES = 4 * 1024 * 1024;
const processingSteps = ["Reading lecture material...", "Finding exam-worthy concepts...", "Removing low-value information...", "Building revision sheet...", "Generating practice questions..."];

interface StoredPack { pack: StudyPack; course: string; fileName: string; questionStyle: QuestionStyle; isSample: boolean; createdAt: string }

function PageSource({ page }: { page: number | null }) {
  return page ? <span className="source-pill"><FileText size={12} /> Source: Page {page}</span> : null;
}

export default function ExamSprint() {
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
    if (!busy) return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

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
    setResult(next); setAnswers({}); setActiveQuestion(0);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* The current session remains usable. */ }
  }

  function loadSample() {
    setError(""); setCourse("Operating Systems"); setQuestionStyle("University Theory");
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
      requestAnimationFrame(() => document.getElementById("revision-pack")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (problem) {
      if (abort.signal.aborted) setError(abort.signal.reason === "cancel" ? "Processing canceled. Your previous revision pack is safe." : "Processing took too long. Try a shorter PDF or use the sample lecture.");
      else setError(problem instanceof Error ? problem.message : "Something went wrong. Please try again.");
    } finally { clearTimeout(timeout); controller.current = null; setBusy(false); }
  }

  const completedSteps = Math.min(4, Math.floor(elapsed / 6));
  const answeredCount = Object.keys(answers).length;
  const score = Object.entries(answers).filter(([index, answer]) => result && result.pack.quiz[Number(index)].correctIndex === answer).length;

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
      <button className="sample-button" onClick={loadSample} disabled={busy}><Zap size={15} /> Try Sample Lecture</button>
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
          <div className="pack-header-actions"><button className="back-button" onClick={() => document.querySelector(".builder-card")?.scrollIntoView({ behavior: "smooth" })}><ArrowLeft size={15} /> New lecture</button><button className="export-button" onClick={exportPack}><Printer size={16} /> Export Revision Pack</button></div>
          <div className="pack-title"><div><span className={`result-badge ${result.isSample ? "sample" : ""}`}><Sparkles size={12} /> {result.isSample ? "SAMPLE REVISION PACK" : "AI REVISION PACK"}</span><h2>{result.pack.title}</h2><p>{result.course} <span>·</span> {result.questionStyle} <span>·</span> {result.fileName}</p></div><div className="pack-score"><strong>{answeredCount}<span>/5</span></strong><small>questions answered</small></div></div>
        </div>

        <div className="pack-layout">
          <div className="pack-main">
            <section className="content-section high-yield"><div className="content-heading"><span className="heading-icon fire"><Flame size={18} /></span><div><span>01 · PRIORITY TOPICS</span><h3>High-Yield Concepts</h3></div><small>{result.pack.highYieldTopics.length} concepts</small></div><div className="concept-grid">{result.pack.highYieldTopics.map((item, index) => <article key={`${item.topic}-${index}`}><div className="concept-top"><span>{String(index + 1).padStart(2, "0")}</span><span className={`importance ${item.importance}`}>{item.importance} yield</span></div><h4>{item.topic}</h4><p>{item.explanation}</p><PageSource page={item.sourcePage} /></article>)}</div></section>

            <section className="content-section quick-revision"><div className="content-heading"><span className="heading-icon bolt"><Zap size={18} /></span><div><span>02 · RAPID RECALL</span><h3>60-Second Revision</h3></div></div><div className="summary-callout"><span className="quote">“</span><p>{result.pack.summary}</p></div><div className="rapid-list">{result.pack.highYieldTopics.slice(0, 5).map((item, index) => <div key={item.topic}><CheckCircle2 size={16} /><p><strong>{item.topic}:</strong> {item.explanation}</p><span>{String(index + 1).padStart(2, "0")}</span></div>)}</div></section>

            <section className="content-section"><div className="content-heading"><span className="heading-icon remember"><Brain size={18} /></span><div><span>03 · LOCK IT IN</span><h3>Must Remember</h3></div><small>{result.pack.mustRemember.length} essentials</small></div><div className="remember-list">{result.pack.mustRemember.map((item, index) => <article key={index}><span className="remember-number">{String(index + 1).padStart(2, "0")}</span><p>{item.text}</p><PageSource page={item.sourcePage} /></article>)}</div></section>

            <section className="content-section traps"><div className="content-heading"><span className="heading-icon warning"><AlertTriangle size={18} /></span><div><span>04 · DON’T LOSE MARKS</span><h3>Common Traps</h3></div></div><div className="trap-list">{result.pack.commonTraps.map((trap, index) => <article key={index}><div className="trap-side"><X size={15} /><span>COMMON MISTAKE</span><p>{trap.mistake}</p></div><ChevronRight size={19} /><div className="trap-side correction"><Check size={15} /><span>GET IT RIGHT</span><p>{trap.correction}</p></div></article>)}</div></section>

            <section className="content-section quiz-section"><div className="content-heading"><span className="heading-icon quiz"><Target size={18} /></span><div><span>05 · TEST YOURSELF</span><h3>Practice Quiz</h3></div><small>{answeredCount === 5 ? `${score}/5 correct` : `${answeredCount}/5 answered`}</small></div><div className="quiz-progress" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={answeredCount}><span style={{ width: `${answeredCount * 20}%` }} /></div><div className="question-tabs">{result.pack.quiz.map((question, index) => <button key={index} onClick={() => setActiveQuestion(index)} aria-label={`Question ${index + 1}`} className={`${activeQuestion === index ? "active" : ""} ${answers[index] !== undefined ? (answers[index] === question.correctIndex ? "correct" : "wrong") : ""}`}>{answers[index] !== undefined ? answers[index] === question.correctIndex ? <Check size={14} /> : <X size={14} /> : index + 1}</button>)}</div>{result.pack.quiz.map((question, questionIndex) => questionIndex === activeQuestion && <article className="question-card" key={questionIndex}><div className="question-meta"><span>QUESTION {questionIndex + 1} OF 5</span><PageSource page={question.sourcePage} /></div><h4>{question.question}</h4><div className="options">{question.options.map((option, optionIndex) => { const answered = answers[questionIndex] !== undefined; const selected = answers[questionIndex] === optionIndex; const correct = question.correctIndex === optionIndex; return <button key={optionIndex} disabled={answered} onClick={() => setAnswers(previous => ({ ...previous, [questionIndex]: optionIndex }))} className={`${selected ? "selected" : ""} ${answered && correct ? "correct" : ""} ${answered && selected && !correct ? "wrong" : ""}`}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option}</p>{answered && correct && <CheckCircle2 size={18} />}{answered && selected && !correct && <X size={18} />}</button>; })}</div>{answers[questionIndex] !== undefined && <div className={`answer-panel ${answers[questionIndex] === question.correctIndex ? "correct" : "wrong"}`}><div className="answer-status">{answers[questionIndex] === question.correctIndex ? <CheckCircle2 size={21} /> : <X size={21} />}<strong>{answers[questionIndex] === question.correctIndex ? "Correct" : "Incorrect"}</strong></div><p><span>Correct answer</span>{String.fromCharCode(65 + question.correctIndex)}. {question.options[question.correctIndex]}</p><p><span>Why</span>{question.explanation}</p><PageSource page={question.sourcePage} /></div>}<div className="quiz-nav"><button disabled={questionIndex === 0} onClick={() => setActiveQuestion(questionIndex - 1)}><ArrowLeft size={14} /> Previous</button>{questionIndex < 4 ? <button onClick={() => setActiveQuestion(questionIndex + 1)}>Next question <ChevronRight size={14} /></button> : answeredCount === 5 ? <button onClick={() => { setAnswers({}); setActiveQuestion(0); }}><RotateCcw size={14} /> Try again</button> : null}</div></article>)}</section>

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
  </div>;
}
