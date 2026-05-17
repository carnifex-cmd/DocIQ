import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business Document RAG Assistant",
  description: "Ask questions across uploaded quotations, invoices, and business letters."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
