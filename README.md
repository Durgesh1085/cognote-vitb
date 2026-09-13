# ExamSprint AI

ExamSprint turns a lecture PDF into an exam-focused revision pack grounded only in the uploaded material. It produces high-yield concepts, a condensed 60-second revision, must-remember points, common traps, and exactly five interactive questions with explanations and source pages.

## Run locally

Requires Node.js 20.9+ and npm. From this project directory:

```bash
npm install
```

Copy `.env.example` to `.env.local` if the latter does not already exist:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux equivalent: `cp .env.example .env.local`.

Set `GEMINI_API_KEY` in `.env.local` to a key from [Google AI Studio](https://aistudio.google.com/apikey). Never prefix the key with `NEXT_PUBLIC_`. `GEMINI_MODEL` optionally selects a model supporting structured JSON; the default is `gemini-2.5-flash`. Restart after changing environment variables.

Optional cloud accounts require `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Supabase Row Level Security and the private `lecture-pdfs` bucket keep each signed-in user's library isolated. Guest generation remains fully available when Supabase is not configured.

```bash
npm run dev
```

Open [ExamSprint AI](http://127.0.0.1:3000). For production:

```bash
npm run build
npm start
```

## Demo flow

1. Click **Try Sample Lecture**. The built-in Operating Systems pack works without a key and is explicitly labeled as sample content.
2. Show High-Yield Concepts, page-grounded Must Remember points, and Common Traps.
3. Answer a quiz question. The answer stays hidden until selection, then shows Correct/Incorrect, the correct answer, explanation, and source page.
4. Complete all five questions to show the final score.
5. Click **Export Revision Pack**, then choose **Save as PDF** in the browser print dialog. The print version includes all five answers and explanations.
6. For the live flow, upload a PDF up to 4 MB, enter its course, select a question style, and click **Build My Revision Pack**.

Live failures remain visible and never silently fall back to sample content.

## Implementation

- Next.js App Router, TypeScript, React, Tailwind CSS, Lucide React.
- Official `@google/genai` SDK used only by `POST /api/study-pack`; the API key remains server-side.
- Structured JSON requested with `responseMimeType` and `responseJsonSchema`; see the [official SDK reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html).
- PDF bytes are sent directly to Gemini as inline PDF data. There are no embeddings, vector database, RAG framework, or document index.
- Shared TypeScript interfaces and runtime validation enforce complete fields, four options per question, valid answer indexes, and exactly five questions.
- Client and server file checks, a 50-second request bound, cancellation, quota/configuration/network errors, and a multi-step processing state.
- The most recent generated pack is saved in localStorage. Malformed saved data is removed safely.
- Optional email/password accounts can save the complete pack and original PDF to a private, RLS-protected Supabase library without changing the Gemini flow.
- A dedicated light print layout creates a complete shareable pack through the browser's native print/save-as-PDF flow; no PDF runtime dependency is required.
- No database, authentication, analytics, external fonts, or additional services.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For live PDF processing | Server-only Gemini API key |
| `GEMINI_MODEL` | No | PDF-capable structured-output model; defaults to `gemini-2.5-flash` |
| `NEXT_PUBLIC_SUPABASE_URL` | For cloud accounts | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | For cloud accounts | Browser-safe Supabase publishable key; access remains constrained by RLS |

## Checks

```bash
npm run build
npm run typecheck
```

The lockfile records exact installed versions for reproducible installation with `npm ci`.

## Practical limits

- Live processing requires a valid Gemini key, model access, connectivity, and quota. A key is intentionally not bundled.
- The deployed MVP accepts PDFs up to 4 MB to remain within Vercel Function request limits. Very long or image-heavy files may also exceed model limits or time out.
- Source page numbers are model-extracted and should be checked against the PDF for high-stakes study. They are omitted when the model cannot locate a page.
- Only the latest revision pack is retained in this browser; the original PDF is not stored.
- Cancel stops the browser from waiting; an already-started Gemini request may still complete and incur usage.
- This local hackathon app has no authentication or distributed rate limiting. Add access controls before exposing a paid API key through a public deployment.
