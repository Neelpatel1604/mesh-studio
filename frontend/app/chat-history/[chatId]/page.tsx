"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

type ChatHistoryMessage = {
  user_id: string;
  chat_id: string;
  role: "user" | "assistant" | string;
  content: string;
  compile_job_id?: string | null;
  model_url?: string | null;
  preview_url?: string | null;
  created_at?: string | null;
  created_at_epoch?: number | null;
};

type ChatHistoryResponse = {
  chat_id: string;
  items: ChatHistoryMessage[];
};

export default function ChatHistoryPage() {
  const [items, setItems] = useState<ChatHistoryMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const routeParams = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  const chatId = routeParams?.chatId ?? "default";

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000", []);
  const userIdForLinks = useMemo(
    () => searchParams.get("user_id") ?? "local-user",
    [searchParams],
  );

  const artifactIdFromModelUrl = (url: string | null | undefined) => {
    if (!url) {
      return null;
    }
    const match = url.match(/\/artifacts\/([^/]+)\//i);
    return match?.[1] ?? null;
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const userId =
          searchParams.get("user_id") ??
          window.localStorage.getItem("mesh_studio_user_id") ??
          "local-user";
        const response = await fetch(
          `${apiBase}/chat-history/${encodeURIComponent(chatId)}?user_id=${encodeURIComponent(userId)}`,
        );
        if (!response.ok) {
          throw new Error(`History request failed: ${response.status}`);
        }
        const body = (await response.json()) as ChatHistoryResponse;
        setItems(body.items ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load chat history.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [apiBase, chatId, searchParams]);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "20px",
        color: "#e7dccb",
        height: "100dvh",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Chat History: {chatId}</h1>
        <Link href="/" style={{ color: "#f0a84e" }}>
          Back to Studio
        </Link>
      </div>
      {loading ? <p>Loading history...</p> : null}
      {error ? <p style={{ color: "#ff9e9e" }}>{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p>No history yet for this chat.</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item, idx) => {
          const preview = item.preview_url ? `${apiBase}${item.preview_url}` : null;
          const modelUrl = item.model_url ? `${apiBase}${item.model_url}` : null;
          const artifactId = item.compile_job_id ?? artifactIdFromModelUrl(item.model_url);
          return (
            <article
              key={`${item.created_at_epoch ?? idx}-${idx}`}
              style={{
                border: "1px solid rgba(232,150,58,0.35)",
                borderRadius: 12,
                padding: 12,
                background: item.role === "user" ? "rgba(232,150,58,0.08)" : "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ textTransform: "capitalize" }}>{item.role}</strong>
                {item.created_at ? <span style={{ color: "#b9ae9d", fontSize: 12 }}>{item.created_at}</span> : null}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{item.content}</p>
              {preview ? (
                <img
                  src={`${preview}?t=${item.created_at_epoch ?? idx}`}
                  alt="Model preview"
                  style={{ marginTop: 10, width: "100%", maxWidth: 380, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)" }}
                />
              ) : null}
              {modelUrl ? (
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                  Model:{" "}
                  <a href={modelUrl} target="_blank" rel="noreferrer" style={{ color: "#f0a84e" }}>
                    {modelUrl}
                  </a>
                </p>
              ) : null}
              {artifactId ? (
                <div style={{ marginTop: 8 }}>
                  <Link
                    href={`/${encodeURIComponent(artifactId)}?user_id=${encodeURIComponent(userIdForLinks)}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid rgba(232,150,58,0.45)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      color: "#f0a84e",
                      textDecoration: "none",
                      fontSize: 13,
                    }}
                    title="Open this artifact in model chat"
                  >
                    Chat with this model
                  </Link>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}

