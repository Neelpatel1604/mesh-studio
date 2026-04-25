"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ViewportCanvas } from "./viewport/ViewportCanvas";

type ChatRole = "user" | "assistant";
type ChatEntry = { role: ChatRole; content: string };

export default function App() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      role: "assistant",
      content:
        "Hi! I am in 3D CAD mode. Tell me what object or part you want to model, with size/details.",
    },
  ]);
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-pro");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileStatus, setCompileStatus] = useState<string | null>(null);
  const [compilePreviewUrl, setCompilePreviewUrl] = useState<string | null>(null);
  const [compileModelUrl, setCompileModelUrl] = useState<string | null>(null);
  const [compileModelRotation, setCompileModelRotation] = useState<
    [number, number, number]
  >([0, 0, 0]);
  const [latestCompileJobId, setLatestCompileJobId] = useState<string | null>(null);

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
    [],
  );

  useEffect(() => {
    const loadModelMeta = async () => {
      try {
        const providerResp = await fetch(`${apiBase}/ai/providers`);
        if (!providerResp.ok) {
          return;
        }
        const providerData = (await providerResp.json()) as { providers: string[] };
        if (providerData.providers.length > 0) {
          setProvider(providerData.providers[0]);
        }

        const modelResp = await fetch(`${apiBase}/ai/models?provider=gemini`);
        if (!modelResp.ok) {
          return;
        }
        const modelData = (await modelResp.json()) as { provider: string; models: string[] };
        if (modelData.provider) {
          setProvider(modelData.provider);
        }
        if (modelData.models.length > 0) {
          setModel(modelData.models[0]);
        }
      } catch {
        // Keep defaults if backend is unreachable during load.
      }
    };
    void loadModelMeta();
  }, [apiBase]);

  const pollCompileJob = async (jobId: string) => {
    setCompileStatus("queued");
    const terminalStates = new Set(["completed", "failed", "cancelled"]);
    for (let i = 0; i < 120; i += 1) {
      const resp = await fetch(`${apiBase}/compile/${jobId}`);
      if (!resp.ok) {
        setCompileStatus("failed");
        return;
      }
      const body = (await resp.json()) as {
        status: string;
        error?: string | null;
        output?: {
          preview_url?: string | null;
          stl_url?: string | null;
          orientation?: { mesh_rotation_euler?: [number, number, number] };
        };
      };
      setCompileStatus(body.status);
      if (body.output?.preview_url) {
        setCompilePreviewUrl(`${apiBase}${body.output.preview_url}?t=${Date.now()}`);
      }
      if (body.output?.stl_url) {
        setCompileModelUrl(`${apiBase}${body.output.stl_url}?t=${Date.now()}`);
      }
      if (body.output?.orientation?.mesh_rotation_euler) {
        setCompileModelRotation(body.output.orientation.mesh_rotation_euler);
      }
      if (terminalStates.has(body.status)) {
        if (body.status === "failed" && body.error) {
          setError(body.error);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setCompileStatus("failed");
    setError("Compile polling timed out.");
  };

  const handleRefreshCompile = () => {
    if (latestCompileJobId) {
      void pollCompileJob(latestCompileJobId);
    }
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) {
      return;
    }
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);
    setError(null);
    setCompileStatus("preparing...");
    setCompilePreviewUrl(null);

    try {
      const response = await fetch(`${apiBase}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: "default",
          provider,
          model,
          messages: nextMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          images: [],
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errorBody = (await response.json()) as { detail?: string };
          detail = errorBody.detail ? `: ${errorBody.detail}` : "";
        } catch {
          // Ignore non-JSON error bodies.
        }
        throw new Error(`Request failed with status ${response.status}${detail}`);
      }

      const data = (await response.json()) as {
        provider: string;
        model: string;
        response: string;
        updated_code?: string;
        code_change_applied?: boolean;
        code_change_mode?: string;
        compile_job_id?: string | null;
        compile_status?: string | null;
      };

      setProvider(data.provider);
      setModel(data.model);
      const changeSuffix = data.code_change_applied
        ? `\n\n[Applied ${data.code_change_mode ?? "change"} to current CAD code.]`
        : "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${data.response}${changeSuffix}` },
      ]);
      if (data.compile_status) {
        setCompileStatus(data.compile_status);
      }
      if (data.compile_job_id) {
        setLatestCompileJobId(data.compile_job_id);
        void pollCompileJob(data.compile_job_id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown network error";
      setError(message);
      setCompileStatus("failed");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Backend is unavailable. Please try again." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="viewport-pane">
        <ViewportCanvas modelUrl={compileModelUrl} modelRotationEuler={compileModelRotation} />
      </section>

      <aside className="chat-panel">
        <header className="chat-header">
          AI Chat
          <button
            type="button"
            className="chat-refresh"
            onClick={handleRefreshCompile}
            disabled={!latestCompileJobId || isSending}
          >
            Refresh
          </button>
          <span className="chat-badge">{`${provider} · ${model}`}</span>
        </header>
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`chat-bubble ${msg.role === "user" ? "user" : "assistant"}`}
            >
              {msg.content}
            </div>
          ))}
          {error ? <div className="chat-error">{error}</div> : null}
          {compileStatus ? (
            <div className="compile-status">Compile: {compileStatus}</div>
          ) : null}
          {compilePreviewUrl ? (
            <img src={compilePreviewUrl} className="compile-preview" alt="compile preview" />
          ) : null}
        </div>
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the assistant..."
            className="chat-input"
            disabled={isSending}
          />
          <button type="submit" className="chat-send" disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </aside>
    </main>
  );
}
