"use client";

import { Fragment, FormEvent, ReactNode, useEffect, useState } from "react";

type Source = {
  source_file: string;
  source_path?: string;
  page_number: number | null;
};

type IndexError = {
  source_path: string;
  error: string;
};

type IndexResult = {
  total_files_found: number;
  files_indexed: number;
  files_skipped: number;
  chunks_created: number;
  errors: IndexError[];
};

type IndexStatus = {
  indexed_files_count: number;
  total_chunks: number;
  embedding_provider: string;
  llm_provider: string;
};

type ParagraphBlock = {
  type: "paragraph";
  text: string;
};

type ListBlock = {
  type: "list";
  items: string[];
  ordered: boolean;
};

type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

type AnswerBlock = ParagraphBlock | ListBlock | TableBlock;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const TABLE_SEPARATOR_PATTERN = /^\|?[\s:-]+\|[\s|:-]*$/;

function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function isTableRow(line: string): boolean {
  return line.includes("|");
}

function normalizeTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseAnswerBlocks(answerText: string): AnswerBlock[] {
  const normalized = answerText.trim();
  if (!normalized) {
    return [];
  }

  const rawBlocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

  return rawBlocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

    if (
      lines.length >= 2 &&
      isTableRow(lines[0]) &&
      TABLE_SEPARATOR_PATTERN.test(lines[1]) &&
      lines.slice(2).every(isTableRow)
    ) {
      return {
        type: "table",
        headers: normalizeTableCells(lines[0]),
        rows: lines.slice(2).map(normalizeTableCells)
      };
    }

    const unorderedItems = lines
      .map((line) => line.match(/^[-*]\s+(.*)$/)?.[1] ?? null);
    if (unorderedItems.every((item) => item !== null)) {
      return {
        type: "list",
        items: unorderedItems as string[],
        ordered: false
      };
    }

    const orderedItems = lines
      .map((line) => line.match(/^\d+\.\s+(.*)$/)?.[1] ?? null);
    if (orderedItems.every((item) => item !== null)) {
      return {
        type: "list",
        items: orderedItems as string[],
        ordered: true
      };
    }

    return {
      type: "paragraph",
      text: lines.join(" ")
    };
  });
}

function AnswerRenderer({ answer }: { answer: string }) {
  const blocks = parseAnswerBlocks(answer);

  if (blocks.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-line/80 bg-white/70 px-5 py-8 text-sm text-slate-500">
        Answers will appear here after you ask a question.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {blocks.map((block, blockIndex) => {
        if (block.type === "table") {
          return (
            <div
              key={`table-${blockIndex}`}
              className="overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[0_12px_30px_rgba(18,32,51,0.06)]"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm text-slate-700">
                  <thead className="bg-[linear-gradient(180deg,#eff6fb_0%,#e7f0f6_100%)] text-slate-800">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th
                          key={`header-${blockIndex}-${headerIndex}`}
                          className="border-b border-line px-4 py-3 font-semibold"
                        >
                          {renderInlineFormatting(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr
                        key={`row-${blockIndex}-${rowIndex}`}
                        className="align-top odd:bg-white even:bg-slate-50/70"
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`cell-${blockIndex}-${rowIndex}-${cellIndex}`}
                            className="border-t border-line px-4 py-3 leading-6"
                          >
                            {renderInlineFormatting(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";

          return (
            <ListTag
              key={`list-${blockIndex}`}
              className={`space-y-2 pl-5 text-sm leading-7 text-slate-700 ${
                block.ordered ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${blockIndex}-${itemIndex}`}>{renderInlineFormatting(item)}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p
            key={`paragraph-${blockIndex}`}
            className="text-[15px] leading-7 text-slate-700"
          >
            {renderInlineFormatting(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [statusMessage, setStatusMessage] = useState("Index documents from backend/documents to get started.");
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [asking, setAsking] = useState(false);

  const loadIndexStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/index/status`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to load indexing status.");
      }

      setIndexStatus(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load indexing status.";
      setStatusMessage(message);
    }
  };

  useEffect(() => {
    void loadIndexStatus();
  }, []);

  const indexDocuments = async () => {
    setIndexing(true);
    setStatusMessage("Indexing documents from backend/documents...");
    setAnswer("");
    setSources([]);

    try {
      const response = await fetch(`${API_URL}/index`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to index documents.");
      }

      setIndexResult(data);
      setStatusMessage("Indexing complete.");
      await loadIndexStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to index documents.";
      setStatusMessage(message);
      setIndexResult(null);
    } finally {
      setIndexing(false);
    }
  };

  const askQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!question.trim()) {
      setStatusMessage("Enter a question first.");
      return;
    }

    setAsking(true);
    setStatusMessage("Searching indexed documents...");

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
      setStatusMessage("Answer ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to answer the question.";
      setStatusMessage(message);
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
            Place PDF or DOCX files in <span className="font-medium">backend/documents/</span>,
            index them once, then ask questions against the stored document chunks.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Index documents from folder</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              The backend scans <span className="font-medium">backend/documents/</span> recursively
              for supported files and updates the Chroma index.
            </p>

            <button
              className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={indexDocuments}
              disabled={indexing}
              type="button"
            >
              {indexing ? "Indexing..." : "Index Documents"}
            </button>

            <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <p>{statusMessage}</p>
              {indexStatus ? (
                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <p>Indexed files: {indexStatus.indexed_files_count}</p>
                  <p>Total chunks: {indexStatus.total_chunks}</p>
                  <p>Embeddings: {indexStatus.embedding_provider}</p>
                  <p>LLM: {indexStatus.llm_provider}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-2xl border border-line px-4 py-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Latest indexing result
              </h3>
              {indexResult ? (
                <div className="mt-4 space-y-4 text-sm text-slate-700">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>Files found: {indexResult.total_files_found}</p>
                    <p>Files indexed: {indexResult.files_indexed}</p>
                    <p>Files skipped: {indexResult.files_skipped}</p>
                    <p>Chunks created: {indexResult.chunks_created}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Errors</p>
                    {indexResult.errors.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-2">
                        {indexResult.errors.map((item) => (
                          <div
                            key={`${item.source_path}-${item.error}`}
                            className="rounded-2xl bg-slate-50 px-3 py-3 text-sm"
                          >
                            <p className="font-medium">{item.source_path}</p>
                            <p className="mt-1 text-slate-600">{item.error}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-slate-500">No indexing errors.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Run indexing to see file counts and any per-file errors.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Ask questions</h2>
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
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Answer</h2>
          <div className="mt-4 rounded-[2rem] bg-[linear-gradient(180deg,#f7fafc_0%,#eef3f7_100%)] px-5 py-5 shadow-inner">
            <AnswerRenderer answer={answer} />
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sources
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              {sources.length > 0 ? (
                sources.map((source, index) => (
                  <div
                    key={`${source.source_path ?? source.source_file}-${source.page_number ?? "na"}-${index}`}
                    className="rounded-2xl border border-line px-4 py-3 text-sm text-slate-700"
                  >
                    <p className="font-medium">{source.source_file}</p>
                    {source.source_path ? (
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">
                        {source.source_path}
                      </p>
                    ) : null}
                    <span className="mt-2 inline-block text-slate-500">
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
