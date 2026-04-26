"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import App from "../../src/App";

type UserArtifact = {
  compile_job_id: string;
  stl_url?: string | null;
  model_3mf_url?: string | null;
};

type UserArtifactListResponse = {
  user_id: string;
  items: UserArtifact[];
};

type CompileJobResponse = {
  status?: string;
  output?: {
    stl_url?: string | null;
    model_3mf_url?: string | null;
    orientation?: {
      mesh_rotation_euler?: [number, number, number] | null;
    } | null;
  } | null;
};

const LOCAL_USER_ID_KEY = "mesh_studio_user_id";

export default function ArtifactChatPage() {
  const params = useParams<{ artifactId: string }>();
  const searchParams = useSearchParams();
  const artifactId = params?.artifactId ?? "";
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000", []);
  const [artifactModelUrl, setArtifactModelUrl] = useState<string | null>(null);
  const [artifactModelRotation, setArtifactModelRotation] = useState<[number, number, number] | null>(null);
  const [artifactLoadStatus, setArtifactLoadStatus] = useState<string>("loading artifact model...");

  useEffect(() => {
    const run = async () => {
      const userId =
        searchParams.get("user_id") ??
        window.localStorage.getItem(LOCAL_USER_ID_KEY) ??
        "local-user";
      if (!artifactId.trim()) {
        setArtifactLoadStatus("artifact id missing");
        return;
      }
      try {
        const compileResponse = await fetch(`${apiBase}/compile/${encodeURIComponent(artifactId)}`);
        if (compileResponse.ok) {
          const compileBody = (await compileResponse.json()) as CompileJobResponse;
          const compileModelPath = compileBody.output?.model_3mf_url ?? compileBody.output?.stl_url ?? null;
          const compileRotation = compileBody.output?.orientation?.mesh_rotation_euler;
          if (compileModelPath) {
            setArtifactModelUrl(`${apiBase}${compileModelPath}`);
            if (Array.isArray(compileRotation) && compileRotation.length === 3) {
              setArtifactModelRotation([
                Number(compileRotation[0]),
                Number(compileRotation[1]),
                Number(compileRotation[2]),
              ]);
            } else {
              setArtifactModelRotation(null);
            }
            setArtifactLoadStatus("loaded artifact model");
            return;
          }
        }

        const response = await fetch(`${apiBase}/users/${encodeURIComponent(userId)}/artifacts`);
        if (!response.ok) {
          setArtifactModelUrl(`${apiBase}/artifacts/${encodeURIComponent(artifactId)}/model.stl`);
          setArtifactModelRotation(null);
          setArtifactLoadStatus("loading artifact model (direct path)");
          return;
        }
        const body = (await response.json()) as UserArtifactListResponse;
        const record = (body.items ?? []).find((item) => item.compile_job_id === artifactId);
        if (!record) {
          setArtifactModelUrl(`${apiBase}/artifacts/${encodeURIComponent(artifactId)}/model.stl`);
          setArtifactModelRotation(null);
          setArtifactLoadStatus("loading artifact model (direct path)");
          return;
        }
        const modelPath = record.model_3mf_url ?? record.stl_url ?? null;
        if (modelPath) {
          setArtifactModelUrl(`${apiBase}${modelPath}`);
          setArtifactModelRotation(null);
          setArtifactLoadStatus("loaded artifact model");
        } else {
          setArtifactModelUrl(`${apiBase}/artifacts/${encodeURIComponent(artifactId)}/model.stl`);
          setArtifactModelRotation(null);
          setArtifactLoadStatus("loading artifact model (direct path)");
        }
      } catch {
        setArtifactModelUrl(`${apiBase}/artifacts/${encodeURIComponent(artifactId)}/model.stl`);
        setArtifactModelRotation(null);
        setArtifactLoadStatus("loading artifact model (direct path)");
      }
    };
    void run();
  }, [apiBase, artifactId, searchParams]);

  return (
    <App
      initialSessionId={`artifact-${artifactId || "default"}`}
      initialModelUrl={artifactModelUrl}
      initialCompileStatus={artifactLoadStatus}
      initialModelRotation={artifactModelRotation}
    />
  );
}
