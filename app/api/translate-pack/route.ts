import { ApiError, GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { isRecord, parseStudyPack, studyPackSchema, type StudyPack } from "@/lib/study-pack";

export const runtime = "nodejs";
export const maxDuration = 60;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function preservesStructure(original: StudyPack, translated: StudyPack) {
  if (original.highYieldTopics.length !== translated.highYieldTopics.length || original.mustRemember.length !== translated.mustRemember.length || original.commonTraps.length !== translated.commonTraps.length) return false;
  if (original.highYieldTopics.some((item, index) => item.sourcePage !== translated.highYieldTopics[index].sourcePage || item.importance !== translated.highYieldTopics[index].importance)) return false;
  if (original.mustRemember.some((item, index) => item.sourcePage !== translated.mustRemember[index].sourcePage)) return false;
  return original.quiz.every((item, index) => item.correctIndex === translated.quiz[index].correctIndex && item.sourcePage === translated.quiz[index].sourcePage && item.options.length === translated.quiz[index].options.length);
}

export async function POST(request: Request) {
  let original: StudyPack;
  try {
    const body: unknown = await request.json();
    original = parseStudyPack(isRecord(body) ? body.pack : null);
  } catch { return fail("The English revision pack is incomplete and cannot be translated safely.", 400); }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fail("Hindi translation is not configured. Add GEMINI_API_KEY and restart the server.", 503);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Translate this existing revision pack from English to natural, student-friendly Hindi. Translate faithfully. Do not add, remove, reinterpret, or correct academic content. Preserve technical terms in English where that improves accuracy. Preserve formulas, symbols, numerical values, array order, importance values, sourcePage values, correctIndex values, and the exact four-option structure of every quiz question. Return only the translated JSON matching the supplied schema.\n\nENGLISH PACK:\n${JSON.stringify(original)}` }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: studyPackSchema,
        temperature: 0.1,
        maxOutputTokens: 8000,
        abortSignal: AbortSignal.timeout(50000),
      },
    });
    let translated: StudyPack;
    try { translated = parseStudyPack(JSON.parse(response.text || "")); }
    catch { return fail("Gemini returned an incomplete translation. The English pack is unchanged—please retry.", 502); }
    if (!preservesStructure(original, translated)) return fail("The translation changed protected quiz or source data, so it was rejected. Please retry.", 502);
    return NextResponse.json({ pack: translated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return fail("Hindi translation is temporarily rate limited. Wait a moment and retry.", 429);
    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) return fail("Hindi translation took too long. Please retry.", 504);
    return fail("Hindi translation is unavailable right now. Your English pack is unchanged.", 502);
  }
}
