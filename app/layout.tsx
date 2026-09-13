import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ExamSprint AI — Lecture to revision", description: "Turn lecture PDFs into grounded revision notes and practice questions with Gemini." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
