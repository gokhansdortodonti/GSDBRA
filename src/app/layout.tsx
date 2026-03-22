import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrthoScan Pro — 3D Bracket Planning",
  description: "AI-powered orthodontic bracket placement on 3D intraoral scans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
