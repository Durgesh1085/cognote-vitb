export type QuestionStyle = "University Theory" | "MCQ" | "Placement / Interview";

export interface HighYieldTopic {
  topic: string;
  explanation: string;
  sourcePage: number | null;
  importance: "high" | "medium";
}

export interface MustRememberItem {
  text: string;
  sourcePage: number | null;
}

export interface CommonTrap {
  mistake: string;
  correction: string;
}

export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  sourcePage: number | null;
}

export interface StudyPack {
  title: string;
  summary: string;
  highYieldTopics: HighYieldTopic[];
  mustRemember: MustRememberItem[];
  commonTraps: CommonTrap[];
  quiz: [QuizQuestion, QuizQuestion, QuizQuestion, QuizQuestion, QuizQuestion];
}

const sourcePageSchema = { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] };
const stringSchema = { type: "string" };

export const studyPackSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: stringSchema,
    summary: stringSchema,
    highYieldTopics: {
      type: "array", minItems: 3, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        properties: { topic: stringSchema, explanation: stringSchema, sourcePage: sourcePageSchema, importance: { type: "string", enum: ["high", "medium"] } },
        required: ["topic", "explanation", "sourcePage", "importance"],
      },
    },
    mustRemember: {
      type: "array", minItems: 3, maxItems: 10,
      items: { type: "object", additionalProperties: false, properties: { text: stringSchema, sourcePage: sourcePageSchema }, required: ["text", "sourcePage"] },
    },
    commonTraps: {
      type: "array", minItems: 2, maxItems: 6,
      items: { type: "object", additionalProperties: false, properties: { mistake: stringSchema, correction: stringSchema }, required: ["mistake", "correction"] },
    },
    quiz: {
      type: "array", minItems: 5, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          question: stringSchema,
          options: { type: "array", minItems: 4, maxItems: 4, items: stringSchema },
          correctIndex: { type: "integer", minimum: 0, maximum: 3 },
          explanation: stringSchema,
          sourcePage: sourcePageSchema,
        },
        required: ["question", "options", "correctIndex", "explanation", "sourcePage"],
      },
    },
  },
  required: ["title", "summary", "highYieldTopics", "mustRemember", "commonTraps", "quiz"],
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max = 2500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}.`);
  return value.trim().slice(0, max);
}

function page(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10000) throw new Error("Invalid source page.");
  return value;
}

export function parseStudyPack(value: unknown): StudyPack {
  if (!isRecord(value)) throw new Error("The revision pack is invalid.");
  if (!Array.isArray(value.highYieldTopics) || value.highYieldTopics.length < 1 || value.highYieldTopics.length > 8) throw new Error("High-yield topics are missing.");
  if (!Array.isArray(value.mustRemember) || value.mustRemember.length < 1 || value.mustRemember.length > 10) throw new Error("Must-remember points are missing.");
  if (!Array.isArray(value.commonTraps) || value.commonTraps.length < 1 || value.commonTraps.length > 6) throw new Error("Common traps are missing.");
  if (!Array.isArray(value.quiz) || value.quiz.length !== 5) throw new Error("The quiz must contain exactly five questions.");

  const quiz = value.quiz.map((item, index): QuizQuestion => {
    if (!isRecord(item) || !Array.isArray(item.options) || item.options.length !== 4) throw new Error(`Question ${index + 1} is incomplete.`);
    if (typeof item.correctIndex !== "number" || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) throw new Error(`Question ${index + 1} has an invalid answer.`);
    const options = item.options.map((option, optionIndex) => text(option, `question ${index + 1} option ${optionIndex + 1}`, 500)) as [string, string, string, string];
    return { question: text(item.question, `question ${index + 1}`, 1000), options, correctIndex: item.correctIndex, explanation: text(item.explanation, `question ${index + 1} explanation`, 1500), sourcePage: page(item.sourcePage) };
  }) as StudyPack["quiz"];

  return {
    title: text(value.title, "title", 160),
    summary: text(value.summary, "summary", 1000),
    highYieldTopics: value.highYieldTopics.map((item, index) => {
      if (!isRecord(item) || (item.importance !== "high" && item.importance !== "medium")) throw new Error(`Topic ${index + 1} is invalid.`);
      return { topic: text(item.topic, `topic ${index + 1}`, 250), explanation: text(item.explanation, `topic ${index + 1} explanation`, 1500), sourcePage: page(item.sourcePage), importance: item.importance };
    }),
    mustRemember: value.mustRemember.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Must-remember point ${index + 1} is invalid.`);
      return { text: text(item.text, `must-remember point ${index + 1}`, 1000), sourcePage: page(item.sourcePage) };
    }),
    commonTraps: value.commonTraps.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Common trap ${index + 1} is invalid.`);
      return { mistake: text(item.mistake, `common trap ${index + 1}`, 600), correction: text(item.correction, `common trap ${index + 1} correction`, 1200) };
    }),
    quiz,
  };
}

export function isQuestionStyle(value: unknown): value is QuestionStyle {
  return value === "University Theory" || value === "MCQ" || value === "Placement / Interview";
}
