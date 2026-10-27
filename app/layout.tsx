import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI-Driven SEO & Content Readiness Audits",
  description:
    "Stop optimizing for yesteryear. AI-driven technical SEO & content readiness audits show how ChatGPT Search, Google Gemini, and Perplexity find, trust, and cite your site — scored and client-ready in under 60 seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
