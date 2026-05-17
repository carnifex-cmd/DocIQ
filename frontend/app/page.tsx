"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type Source = {
  source_file: string;
  page_number: number | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState("Upload PDF or DOCX files, then process them.");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
    setStatus("Files selected. Process documents to index them.");
  };

  const processDocuments = async () => {
    if (files.length === 0) {
      setStatus("Select at least one PDF or DOCX file.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    setUploading(true);
    setAnswer("");
    setSources([]);
    setStatus("Processing documents...");

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to process documents.");
      }

      setStatus(
        `Processed ${data.processed_files.length} file(s) into ${data.chunk_count} chunk(s).`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process documents.";
      setStatus(message);
    } finally {
      setUploading(false);
    }
  };

  const askQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!question.trim()) {
      setStatus("Enter a question first.");
      return;
    }

    setAsking(true);
    setStatus("Searching documents...");

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to answer the question.");
      }

      setAnswer(data.answer);
      setSources(data.sources ?? []);
      setStatus("Answer ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to answer the question.";
      setStatus(message);
      setAnswer("");
      setSources([]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#eef4f7_0%,#f8fbfc_45%,#ffffff_100%)] px-6 py-12 text-ink">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(31,111,120,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(18,32,51,0.12),transparent_38%)]" />
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-3xl border border-line bg-white px-8 py-10 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
            Simple RAG
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Business Document RAG Assistant
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Upload quotations, invoices, and business letters, process them once,
            then ask questions against the indexed document chunks.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Upload Documents</h2>
            <label className="mt-4 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-slate-50 px-6 text-center">
              <span className="text-base font-medium">Choose PDF or DOCX files</span>
              <span className="mt-2 text-sm text-slate-500">
                Multiple files are supported.
              </span>
              <input
                className="hidden"
                type="file"
                accept=".pdf,.docx"
                multiple
                onChange={onFileChange}
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {files.length > 0 ? (
                files.map((file) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    className="rounded-full border border-line px-3 py-1 text-sm text-slate-700"
                  >
                    {file.name}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500">No files selected.</p>
              )}
            </div>

            <button
              className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={processDocuments}
              disabled={uploading}
              type="button"
            >
              {uploading ? "Processing..." : "Process Documents"}
            </button>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Ask a Question</h2>
            <form className="mt-4 flex flex-col gap-4" onSubmit={askQuestion}>
              <textarea
                className="min-h-40 rounded-2xl border border-line px-4 py-3 text-sm outline-none transition focus:border-accent"
                placeholder="What is the quoted amount for ACME Corp?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button
                className="inline-flex w-fit rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={asking}
                type="submit"
              >
                {asking ? "Asking..." : "Ask"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {status}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Answer</h2>
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-5">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {answer || "Answers will appear here after you ask a question."}
            </p>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sources
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              {sources.length > 0 ? (
                sources.map((source, index) => (
                  <div
                    key={`${source.source_file}-${source.page_number ?? "na"}-${index}`}
                    className="rounded-2xl border border-line px-4 py-3 text-sm text-slate-700"
                  >
                    <span className="font-medium">{source.source_file}</span>
                    <span className="ml-2 text-slate-500">
                      {source.page_number ? `Page ${source.page_number}` : "Page not available"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Source file names will be listed here when available.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
