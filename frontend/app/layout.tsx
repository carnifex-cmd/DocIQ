import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business Document RAG Assistant",
  description: "Index business documents from a backend folder and ask questions across them."
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
