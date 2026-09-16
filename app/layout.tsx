import type { Metadata } from "next";
import "./globals.css";
import "./cognote.css";
import "./studio.css";
import "./theme.css";
export const metadata: Metadata = { title: "Cognote — Turn lectures into understanding", description: "Turn lecture PDFs into grounded, exam-ready revision experiences." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
