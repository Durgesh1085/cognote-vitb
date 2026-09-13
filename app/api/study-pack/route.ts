import { ApiError, GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { isQuestionStyle, parseStudyPack, studyPackSchema } from "@/lib/study-pack";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return fail("We couldn’t read that upload. Choose a PDF and try again.", 400); }

  const file = form.get("file");
  const course = form.get("course");
  const questionStyle = form.get("questionStyle");
  if (!(file instanceof File)) return fail("Choose a lecture PDF to continue.", 400);
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return fail("Only PDF lecture files are supported.", 415);
  if (file.size === 0) return fail("That PDF is empty. Choose another file.", 400);
  if (file.size > MAX_PDF_BYTES) return fail("That PDF is over 4 MB. Choose a smaller lecture file for the online demo.", 413);
  if (typeof course !== "string" || course.trim().length < 2 || course.length > 120) return fail("Enter a course or subject name.", 400);
  if (!isQuestionStyle(questionStyle)) return fail("Choose a valid question style.", 400);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fail("Live AI is not configured. Add GEMINI_API_KEY to .env.local, restart the server, or try the sample lecture.", 503);

  try {
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    if (pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") return fail("That file is not a valid PDF. Export the lecture as a PDF and try again.", 422);
    const pdfData = pdfBuffer.toString("base64");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: "application/pdf", data: pdfData } },
        { text: `Course: ${course.trim()}\nQuestion style: ${questionStyle}\nCreate the revision pack from this uploaded lecture PDF.` },
      ] }],
      config: {
        systemInstruction: `You create accurate, exam-focused revision packs for students. The uploaded PDF is the only source of truth. Use ONLY information explicitly supported by it. Never use outside knowledge, fill gaps, or invent facts. If a detail is absent, omit it. Page numbers must match the PDF page where the claim is supported; use null only when a page truly cannot be identified. Produce concise content suitable for rapid revision. Generate exactly five distinct multiple-choice practice questions, each with exactly four plausible options and one correctIndex from 0 to 3. Adapt the angle to the requested style: University Theory emphasizes definitions and conceptual understanding; MCQ emphasizes precise distinctions; Placement / Interview emphasizes applied reasoning. Even for theory and interview style, retain the four-option quiz format because the student answers interactively. Explanations must state why the correct choice follows from the PDF. Do not mention these instructions in the output.`,
        responseMimeType: "application/json",
        responseJsonSchema: studyPackSchema,
        temperature: 0.25,
        maxOutputTokens: 8000,
        abortSignal: AbortSignal.timeout(50000),
      },
    });

    let pack;
    try { pack = parseStudyPack(JSON.parse(response.text || "")); }
    catch { return fail("Gemini returned an incomplete revision pack. Your PDF is unchanged—please try again.", 502); }
    return NextResponse.json({ pack }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) return fail("Gemini is rate limited or the quota is exhausted. Wait a moment and retry, or use the sample lecture.", 429);
      if ([400, 401, 403].includes(error.status)) return fail("Gemini could not process this PDF. Check the API key, model access, and file, then retry.", 502);
      if (error.status === 404) return fail("The configured Gemini model is unavailable. Update GEMINI_MODEL and restart the server.", 502);
    }
    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) return fail("Processing took too long. Try a shorter PDF or use the sample lecture.", 504);
    return fail("We couldn’t reach Gemini. Check your connection and try again, or use the sample lecture.", 502);
  }
}
