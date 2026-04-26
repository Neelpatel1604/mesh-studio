"use client";

import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock3, Mic, Plus, Redo2, Save, Square, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { EditorViewportCanvas } from "./components/viewport/EditorViewportCanvas";
import { DisplayControls } from "./components/ui/DisplayControls";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { DisplayMode, EditorTool, MeasureSubtool, PersistedEditorState, Unit } from "./components/viewport/editorTypes";

type ChatRole = "user" | "assistant";
type ChatEntry = { role: ChatRole; content: string };
type Vec3 = [number, number, number];
type EditorControlPoint = {
  id: string;
  position: Vec3;
};
type EditorStatePayload = PersistedEditorState & {
  selected_control_point: EditorControlPoint | null;
  measurement_points: Vec3[];
};

type SpeechRecognitionResultEvent = Event & {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: Event & { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

const DEFAULT_SESSION_ID = "default";
const LOCAL_USER_ID_KEY = "mesh_studio_user_id";
const LOCAL_UI_STATE_PREFIX = "mesh_studio_ui_state";
const DEFAULT_STL_ROTATION: [number, number, number] = [-1.57079632679, 0, 0];
const DEFAULT_MODEL_ROTATION: [number, number, number] = [0, 0, 0];
const DEFAULT_MODEL_POSITION: [number, number, number] = [0, 0, 0];
const DEFAULT_MODEL_SCALE: [number, number, number] = [1, 1, 1];
const normalizeDisplayMode = (value: DisplayMode | null | undefined): DisplayMode =>
  value === "solid_wire" ? "solid" : (value ?? "solid");
const DEFAULT_WELCOME_MESSAGES: ChatEntry[] = [
  {
    role: "assistant",
    content:
      "Hi! I am in 3D CAD mode. Tell me what object or part you want to model, with size/details.",
  },
];

const getOrCreateLocalUserId = () => {
  if (typeof window === "undefined") {
    return "local-user-server";
  }
  const existing = window.localStorage.getItem(LOCAL_USER_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  const generated = `local-${crypto.randomUUID()}`;
  window.localStorage.setItem(LOCAL_USER_ID_KEY, generated);
  return generated;
};

type AppProps = {
  initialSessionId?: string;
  initialModelUrl?: string | null;
  initialCompileStatus?: string | null;
  initialModelRotation?: [number, number, number] | null;
};
type ModelSectionOption = {
  id: string;
  label: string;
};
type PersistedUiState = {
  draft?: string;
  messages?: ChatEntry[];
  provider?: string;
  model?: string;
  compileStatus?: string | null;
  saveStatus?: string | null;
  compilePreviewUrl?: string | null;
  compileModelUrl?: string | null;
  compileModelRotation?: [number, number, number];
  compileModelPosition?: [number, number, number];
  compileModelScale?: [number, number, number];
  compileModelColor?: string;
  selectedSectionId?: string;
  sectionColorMap?: Record<string, string>;
  latestCompileJobId?: string | null;
  activeTool?: EditorTool;
  measurementUnit?: Unit;
  displayMode?: DisplayMode;
  measureSubtool?: MeasureSubtool;
  transformPanelPosition?: { x: number; y: number } | null;
};

const measurementUnitItems: Array<{ label: string; value: Unit }> = [
  { label: "mm", value: "mm" },
  { label: "cm", value: "cm" },
  { label: "in", value: "in" },
];

export default function App({
  initialSessionId = DEFAULT_SESSION_ID,
  initialModelUrl = null,
  initialCompileStatus = null,
  initialModelRotation = null,
}: AppProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>(DEFAULT_WELCOME_MESSAGES);
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-pro");
  const [isSending, setIsSending] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileStatus, setCompileStatus] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [compilePreviewUrl, setCompilePreviewUrl] = useState<string | null>(null);
  const [compileModelUrl, setCompileModelUrl] = useState<string | null>(null);
  const [compileModelRotation, setCompileModelRotation] = useState<
    [number, number, number]
  >([0, 0, 0]);
  const [compileModelPosition, setCompileModelPosition] = useState<[number, number, number]>(
    DEFAULT_MODEL_POSITION,
  );
  const [compileModelScale, setCompileModelScale] = useState<[number, number, number]>(
    DEFAULT_MODEL_SCALE,
  );
  const [compileModelColor, setCompileModelColor] = useState("#b5b5b5");
  const [modelSectionOptions, setModelSectionOptions] = useState<ModelSectionOption[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [sectionColorMap, setSectionColorMap] = useState<Record<string, string>>({});
  const [transformPanelPosition, setTransformPanelPosition] = useState<{ x: number; y: number }>({
    x: 12,
    y: 54,
  });
  const [isTransformPanelExpanded, setIsTransformPanelExpanded] = useState(true);
  const [isDraggingTransformPanel, setIsDraggingTransformPanel] = useState(false);
  const [latestCompileJobId, setLatestCompileJobId] = useState<string | null>(null);
  const [exportEditedMesh, setExportEditedMesh] = useState<(() => Blob | null) | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>("orbit");
  const [measurementUnit, setMeasurementUnit] = useState<Unit>("mm");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solid");
  const [measureSubtool, setMeasureSubtool] = useState<MeasureSubtool>("bounding_dimensions");
  const [editorState, setEditorState] = useState<EditorStatePayload | null>(null);
  const [clearMeasureNonce, setClearMeasureNonce] = useState(0);
  const [userId, setUserId] = useState<string>("local-user");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const testFileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportPaneRef = useRef<HTMLElement | null>(null);
  const dragTransformPanelRef = useRef<{
    active: boolean;
    pointerOffsetX: number;
    pointerOffsetY: number;
  }>({
    active: false,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
  });
  const hasRestoredUiStateRef = useRef(false);

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
    [],
  );
  const sessionId = initialSessionId.trim() || DEFAULT_SESSION_ID;
  const uiStateStorageKey = `${LOCAL_UI_STATE_PREFIX}:${sessionId}`;
  const toDegrees = (value: number) => (value * 180) / Math.PI;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  useEffect(() => {
    setUserId(getOrCreateLocalUserId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || hasRestoredUiStateRef.current) {
      return;
    }
    hasRestoredUiStateRef.current = true;
    const raw = window.localStorage.getItem(uiStateStorageKey);
    if (!raw) {
      return;
    }
    try {
      const state = JSON.parse(raw) as PersistedUiState;
      if (typeof state.draft === "string") setDraft(state.draft);
      if (Array.isArray(state.messages) && state.messages.length > 0) setMessages(state.messages);
      if (typeof state.provider === "string") setProvider(state.provider);
      if (typeof state.model === "string") setModel(state.model);
      if (typeof state.compileStatus === "string" || state.compileStatus === null) setCompileStatus(state.compileStatus ?? null);
      if (typeof state.saveStatus === "string" || state.saveStatus === null) setSaveStatus(state.saveStatus ?? null);
      if (typeof state.compilePreviewUrl === "string" || state.compilePreviewUrl === null) setCompilePreviewUrl(state.compilePreviewUrl ?? null);
      if (typeof state.compileModelUrl === "string" || state.compileModelUrl === null) setCompileModelUrl(state.compileModelUrl ?? null);
      if (Array.isArray(state.compileModelRotation) && state.compileModelRotation.length === 3) setCompileModelRotation(state.compileModelRotation);
      if (Array.isArray(state.compileModelPosition) && state.compileModelPosition.length === 3) setCompileModelPosition(state.compileModelPosition);
      if (Array.isArray(state.compileModelScale) && state.compileModelScale.length === 3) setCompileModelScale(state.compileModelScale);
      if (typeof state.compileModelColor === "string") setCompileModelColor(state.compileModelColor);
      if (typeof state.selectedSectionId === "string") setSelectedSectionId(state.selectedSectionId);
      if (state.sectionColorMap && typeof state.sectionColorMap === "object") setSectionColorMap(state.sectionColorMap);
      if (typeof state.latestCompileJobId === "string" || state.latestCompileJobId === null) setLatestCompileJobId(state.latestCompileJobId ?? null);
      if (state.activeTool) setActiveTool(state.activeTool);
      if (state.measurementUnit) setMeasurementUnit(state.measurementUnit);
      if (state.displayMode) setDisplayMode(normalizeDisplayMode(state.displayMode));
      if (state.measureSubtool) setMeasureSubtool(state.measureSubtool);
      if (state.transformPanelPosition) setTransformPanelPosition(state.transformPanelPosition);
    } catch {
      // Ignore invalid stored UI state.
    }
  }, [uiStateStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasRestoredUiStateRef.current) {
      return;
    }
    const state: PersistedUiState = {
      draft,
      messages,
      provider,
      model,
      compileStatus,
      saveStatus,
      compilePreviewUrl,
      compileModelUrl,
      compileModelRotation,
      compileModelPosition,
      compileModelScale,
      compileModelColor,
      selectedSectionId,
      sectionColorMap,
      latestCompileJobId,
      activeTool,
      measurementUnit,
      displayMode,
      measureSubtool,
      transformPanelPosition,
    };
    window.localStorage.setItem(uiStateStorageKey, JSON.stringify(state));
  }, [
    activeTool,
    compileModelColor,
    compileModelPosition,
    compileModelRotation,
    compileModelScale,
    compileModelUrl,
    compilePreviewUrl,
    compileStatus,
    displayMode,
    draft,
    latestCompileJobId,
    measureSubtool,
    measurementUnit,
    messages,
    model,
    provider,
    saveStatus,
    sectionColorMap,
    selectedSectionId,
    transformPanelPosition,
    uiStateStorageKey,
  ]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragTransformPanelRef.current.active) {
        return;
      }
      const pane = viewportPaneRef.current;
      if (!pane) {
        return;
      }
      const paneRect = pane.getBoundingClientRect();
      const rawX = event.clientX - paneRect.left - dragTransformPanelRef.current.pointerOffsetX;
      const rawY = event.clientY - paneRect.top - dragTransformPanelRef.current.pointerOffsetY;
      const panelWidth = 330;
      const panelHeight = 380;
      const maxX = Math.max(8, paneRect.width - panelWidth - 8);
      const maxY = Math.max(8, paneRect.height - panelHeight - 8);
      setTransformPanelPosition({
        x: Math.min(Math.max(8, rawX), maxX),
        y: Math.min(Math.max(8, rawY), maxY),
      });
    };
    const onPointerUp = () => {
      dragTransformPanelRef.current.active = false;
      setIsDraggingTransformPanel(false);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const handleTransformPanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pane = viewportPaneRef.current;
    if (!pane) {
      return;
    }
    const paneRect = pane.getBoundingClientRect();
    dragTransformPanelRef.current.active = true;
    setIsDraggingTransformPanel(true);
    dragTransformPanelRef.current.pointerOffsetX = event.clientX - paneRect.left - transformPanelPosition.x;
    dragTransformPanelRef.current.pointerOffsetY = event.clientY - paneRect.top - transformPanelPosition.y;
  };

  const toggleTransformPanel = () => {
    setIsTransformPanelExpanded((prev) => !prev);
  };

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

  useEffect(() => {
    const loadEditorState = async () => {
      try {
        const response = await fetch(`${apiBase}/sessions/${sessionId}/editor-state`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as EditorStatePayload;
        setEditorState(data);
        setActiveTool(data.active_tool ?? (data.mode as EditorTool) ?? "orbit");
        setMeasurementUnit(data.unit);
        setDisplayMode(normalizeDisplayMode(data.display_mode));
        setMeasureSubtool(data.measure_subtool ?? "bounding_dimensions");
      } catch {
        // Editor endpoints might not exist yet during local startup.
      }
    };
    void loadEditorState();
  }, [apiBase, sessionId]);

  useEffect(() => {
    if (!initialModelUrl) {
      return;
    }
    setCompileModelUrl(initialModelUrl);
    if (initialModelRotation && initialModelRotation.length === 3) {
      setCompileModelRotation(initialModelRotation);
    } else {
      const normalizedUrl = initialModelUrl.toLowerCase();
      if (normalizedUrl.includes(".stl")) {
        setCompileModelRotation(DEFAULT_STL_ROTATION);
      } else {
        setCompileModelRotation(DEFAULT_MODEL_ROTATION);
      }
    }
    setCompilePreviewUrl(null);
    setLatestCompileJobId(null);
    setError(null);
    setCompileStatus(initialCompileStatus ?? "loaded artifact model");
    setCompileModelPosition(DEFAULT_MODEL_POSITION);
    setCompileModelScale(DEFAULT_MODEL_SCALE);
    setModelSectionOptions([]);
    setSelectedSectionId("all");
    setSectionColorMap({});
  }, [initialCompileStatus, initialModelRotation, initialModelUrl]);

  const extractColorHintFromScad = (scad?: string) => {
    if (!scad) {
      return null;
    }
    const quoted = scad.match(/color\s*\(\s*"([^"]+)"\s*\)/i);
    if (quoted?.[1]) {
      return quoted[1];
    }
    const hex = scad.match(/color\s*\(\s*(#[0-9a-fA-F]{3,8})\s*\)/i);
    if (hex?.[1]) {
      return hex[1];
    }
    return null;
  };

  const pollCompileJob = async (jobId: string) => {
    setCompileStatus("queued");
    const terminalStates = new Set(["completed", "failed", "cancelled"]);
    for (let i = 0; i < 800; i += 1) {
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
          model_3mf_url?: string | null;
          orientation?: { mesh_rotation_euler?: [number, number, number] };
        };
      };
      setCompileStatus(body.status);
      if (body.output?.preview_url) {
        const previewUrl = `${apiBase}${body.output.preview_url}?t=${Date.now()}`;
        setCompilePreviewUrl(previewUrl);
      }
      if (body.output?.model_3mf_url) {
        setCompileModelUrl(`${apiBase}${body.output.model_3mf_url}?t=${Date.now()}`);
      } else if (body.output?.stl_url) {
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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setCompileStatus("still running");
    setError("Compile is taking longer than usual. It is still running; please check back shortly.");
  };

  const handleExportEditedModel = () => {
    if (!exportEditedMesh) {
      setError("No editable model is loaded yet.");
      return;
    }
    const blob = exportEditedMesh();
    if (!blob) {
      setError("Unable to export current model. Try compiling/loading it again.");
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `mesh-studio-edited-${timestamp}.stl`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleSaveModel = async () => {
    if (!latestCompileJobId && !exportEditedMesh) {
      setError("No model to save yet.");
      return;
    }
    try {
      setSaveStatus("saving...");
      setError(null);
      if (exportEditedMesh) {
        const editedBlob = exportEditedMesh();
        if (!editedBlob) {
          throw new Error("Unable to export edited model for saving.");
        }
        const formData = new FormData();
        formData.append("file", new File([editedBlob], "mesh-studio-edited.stl", { type: "model/stl" }));
        const uploadResp = await fetch(`${apiBase}/uploads/meshes`, {
          method: "POST",
          body: formData,
        });
        if (!uploadResp.ok) {
          let detail = "";
          try {
            const body = (await uploadResp.json()) as { detail?: string };
            detail = body.detail ? `: ${body.detail}` : "";
          } catch {
            // ignore non-JSON body
          }
          throw new Error(`Save upload failed with status ${uploadResp.status}${detail}`);
        }
        const uploadBody = (await uploadResp.json()) as { file_id: string; file_url: string };
        const saveUploadResp = await fetch(`${apiBase}/users/${userId}/artifacts/save-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_id: uploadBody.file_id,
            file_url: uploadBody.file_url,
          }),
        });
        if (!saveUploadResp.ok) {
          let detail = "";
          try {
            const body = (await saveUploadResp.json()) as { detail?: string };
            detail = body.detail ? `: ${body.detail}` : "";
          } catch {
            // ignore
          }
          throw new Error(`Save failed with status ${saveUploadResp.status}${detail}`);
        }
        const result = (await saveUploadResp.json()) as { message?: string };
        setSaveStatus(result.message ?? "saved");
        return;
      }

      const response = await fetch(`${apiBase}/users/${userId}/artifacts/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compile_job_id: latestCompileJobId }),
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as { detail?: string };
          detail = body.detail ? `: ${body.detail}` : "";
        } catch {
          // ignore
        }
        throw new Error(`Save failed with status ${response.status}${detail}`);
      }
      const result = (await response.json()) as { message?: string };
      setSaveStatus(result.message ?? "saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save model.";
      setSaveStatus("save failed");
      setError(message);
    }
  };

  const handleEditorStateChange = (payload: EditorStatePayload) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void fetch(`${apiBase}/sessions/${sessionId}/editor-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Keep local state if autosave fails.
      });
    }, 500);
  };

  const handleExportMeshReady = useCallback((exporter: (() => Blob | null) | null) => {
    setExportEditedMesh(() => exporter);
  }, []);
  const handleLoadPrebuiltModel = () => {
    setCompileModelUrl(`/premade/cube.stl?t=${Date.now()}`);
    setCompileModelRotation(DEFAULT_STL_ROTATION);
    setCompileStatus("loaded prebuilt model");
    setError(null);
  };

  const handleLoadTestModel = () => {
    testFileInputRef.current?.click();
  };

  const triggerEditorAction = (action: "undo" | "redo") => {
    window.dispatchEvent(new CustomEvent(`meshstudio:${action}`));
  };

  const handleDeleteModel = () => {
    setCompileModelUrl(null);
    setCompilePreviewUrl(null);
    setLatestCompileJobId(null);
    setCompileStatus("model removed");
    setSaveStatus(null);
    setError(null);
    setExportEditedMesh(null);
    setCompileModelPosition(DEFAULT_MODEL_POSITION);
    setCompileModelScale(DEFAULT_MODEL_SCALE);
    setModelSectionOptions([]);
    setSelectedSectionId("all");
    setSectionColorMap({});
  };

  const handleTestFilePicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      setError(null);
      setCompileStatus("uploading model...");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${apiBase}/uploads/meshes`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = (await response.json()) as { detail?: string };
          detail = body.detail ? `: ${body.detail}` : "";
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(`Mesh upload failed with status ${response.status}${detail}`);
      }
      const body = (await response.json()) as { file_id: string; file_url: string; filename?: string };
      setCompileModelUrl(`${apiBase}${body.file_url}?t=${Date.now()}`);
      setCompileModelRotation(DEFAULT_STL_ROTATION);
      setCompileModelPosition(DEFAULT_MODEL_POSITION);
      setCompileModelScale(DEFAULT_MODEL_SCALE);
      setModelSectionOptions([]);
      setSelectedSectionId("all");
      setSectionColorMap({});
      setCompilePreviewUrl(null);
      setLatestCompileJobId(null);
      setSaveStatus("saving...");
      setCompileStatus(`imported model: ${body.filename ?? file.name}`);
      const saveUploadResp = await fetch(`${apiBase}/users/${userId}/artifacts/save-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: body.file_id,
          file_url: body.file_url,
        }),
      });
      if (saveUploadResp.ok) {
        const saveBody = (await saveUploadResp.json()) as { message?: string };
        setSaveStatus(saveBody.message ?? "saved");
      } else {
        setSaveStatus("save failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import STL.";
      setCompileStatus("import failed");
      setError(message);
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    const maybeWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const RecognitionCtor = maybeWindow.SpeechRecognition ?? maybeWindow.webkitSpeechRecognition;
    setSpeechSupported(Boolean(RecognitionCtor));
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      recognitionRef.current?.stop();
    };
  }, []);

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
    const isFirstUserPrompt = nextMessages.filter((msg) => msg.role === "user").length === 1;
    const generationMode = isFirstUserPrompt ? "text_to_3d" : "cad_edit";

    try {
      const response = await fetch(`${apiBase}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId,
          generation_mode: generationMode,
          current_code: generationMode === "text_to_3d" ? null : undefined,
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
      const colorHint = extractColorHintFromScad(data.updated_code);
      if (colorHint) {
        setCompileModelColor(colorHint);
      }
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
        setSaveStatus(null);
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

  const handleToggleMic = async () => {
    const maybeWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const RecognitionCtor = maybeWindow.SpeechRecognition ?? maybeWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setError(null);
    try {
      if (!window.isSecureContext) {
        throw new Error("Microphone needs a secure context (https or localhost).");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose microphone APIs.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone permission failed.";
      setError(`Mic unavailable: ${message}`);
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setDraft(transcript.trimStart());
    };
    recognition.onerror = (event) => {
      const reason = event.error ? ` (${event.error})` : "";
      setError(`Mic input failed${reason}. Try Chrome/Edge on localhost and allow microphone.`);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start speech recognition.";
      setError(`Mic input failed: ${message}`);
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const updateModelPositionAxis = (axis: 0 | 1 | 2, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setCompileModelPosition((prev) => {
      const next: [number, number, number] = [...prev];
      next[axis] = parsed;
      return next;
    });
  };

  const updateModelRotationAxisDeg = (axis: 0 | 1 | 2, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setCompileModelRotation((prev) => {
      const next: [number, number, number] = [...prev];
      next[axis] = toRadians(parsed);
      return next;
    });
  };

  const updateModelScaleAxis = (axis: 0 | 1 | 2, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setCompileModelScale((prev) => {
      const next: [number, number, number] = [...prev];
      next[axis] = parsed;
      return next;
    });
  };

  const handleResetModelTransform = () => {
    const isStl = (compileModelUrl ?? "").toLowerCase().includes(".stl");
    setCompileModelRotation(isStl ? DEFAULT_STL_ROTATION : DEFAULT_MODEL_ROTATION);
    setCompileModelPosition(DEFAULT_MODEL_POSITION);
    setCompileModelScale(DEFAULT_MODEL_SCALE);
  };

  const handleCenterModelPosition = () => {
    setCompileModelPosition(DEFAULT_MODEL_POSITION);
  };

  const handleModelSectionsChange = useCallback(
    (sections: ModelSectionOption[]) => {
      setModelSectionOptions(sections);
      setSectionColorMap((prev) => {
        const valid = new Set(sections.map((section) => section.id));
        const next: Record<string, string> = {};
        for (const [sectionId, color] of Object.entries(prev)) {
          if (valid.has(sectionId)) {
            next[sectionId] = color;
          }
        }
        return next;
      });
      setSelectedSectionId((prev) => {
        if (prev === "all") {
          return prev;
        }
        return sections.some((section) => section.id === prev) ? prev : "all";
      });
    },
    [],
  );

  const activeSectionColor =
    selectedSectionId === "all"
      ? compileModelColor
      : sectionColorMap[selectedSectionId] ?? compileModelColor;

  const handleSectionColorChange = (color: string) => {
    if (selectedSectionId === "all") {
      setCompileModelColor(color);
      return;
    }
    setSectionColorMap((prev) => ({
      ...prev,
      [selectedSectionId]: color,
    }));
  };

  const handleStartNew = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(uiStateStorageKey);
    }
    setDraft("");
    setMessages(DEFAULT_WELCOME_MESSAGES);
    setError(null);
    setCompileStatus(null);
    setSaveStatus(null);
    setCompilePreviewUrl(null);
    setCompileModelUrl(null);
    setCompileModelRotation(DEFAULT_MODEL_ROTATION);
    setCompileModelPosition(DEFAULT_MODEL_POSITION);
    setCompileModelScale(DEFAULT_MODEL_SCALE);
    setCompileModelColor("#b5b5b5");
    setModelSectionOptions([]);
    setSelectedSectionId("all");
    setSectionColorMap({});
    setLatestCompileJobId(null);
    setActiveTool("orbit");
    setMeasurementUnit("mm");
    setDisplayMode("solid");
    setMeasureSubtool("bounding_dimensions");
  };

  return (
    <main className="app-shell">
      <section className="viewport-pane" ref={viewportPaneRef}>
        <div className="toolbar">
          <div className="toolbar-group">
            <button
              type="button"
              className={`toolbar-btn toolbar-btn-text ${activeTool === "orbit" ? "active" : ""}`}
              onClick={() => setActiveTool("orbit")}
            >
              Orbit
            </button>
            <button
              type="button"
              className={`toolbar-btn toolbar-btn-text ${activeTool === "edit" ? "active" : ""}`}
              onClick={() => setActiveTool("edit")}
            >
              Edit
            </button>
            <button
              type="button"
              className={`toolbar-btn toolbar-btn-text ${activeTool === "measure" ? "active" : ""}`}
              onClick={() => setActiveTool("measure")}
            >
              Measure
            </button>
          </div>
          <div className="toolbar-group">
            <DisplayControls
              displayMode={displayMode}
              measureSubtool={measureSubtool}
              onDisplayModeChange={setDisplayMode}
              onMeasureSubtoolChange={setMeasureSubtool}
            />
          </div>
          <div className="toolbar-group">
            <button
              type="button"
              className="toolbar-btn toolbar-btn-text"
              onClick={() => setClearMeasureNonce((prev) => prev + 1)}
            >
              Clear
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-text"
              onClick={handleLoadPrebuiltModel}
              title="Load prebuilt cube model"
            >
              Prebuilt
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-text"
              onClick={handleLoadTestModel}
              title="Import a local STL model"
            >
              Import
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => triggerEditorAction("undo")}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => triggerEditorAction("redo")}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={handleDeleteModel}
              title="Delete current model"
              aria-label="Delete current model"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            ref={testFileInputRef}
            type="file"
            accept=".stl"
            onChange={handleTestFilePicked}
            style={{ display: "none" }}
          />
          <div className="toolbar-group">
            <Select
              value={measurementUnit}
              onValueChange={(value) => {
                if (!value) return;
                setMeasurementUnit(value as Unit);
              }}
            >
              <SelectTrigger aria-label="Unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {measurementUnitItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <span className="toolbar-spacer" />
          <button
            type="button"
            className="toolbar-btn toolbar-btn-text toolbar-btn-primary"
            onClick={handleExportEditedModel}
            disabled={!exportEditedMesh}
            title="Export current edited model as STL"
          >
            Export
          </button>
        </div>
        <EditorViewportCanvas
          modelUrl={compileModelUrl}
          modelRotationEuler={compileModelRotation}
          modelPosition={compileModelPosition}
          modelScale={compileModelScale}
          modelColor={compileModelColor}
          modelSectionColors={sectionColorMap}
          activeTool={activeTool}
          unit={measurementUnit}
          displayMode={displayMode}
          dotDensityMode="dense"
          measureSubtool={measureSubtool}
          persistedEditorState={editorState}
          onEditorStateChange={handleEditorStateChange}
          onExportMeshReady={handleExportMeshReady}
          onModelSectionsChange={handleModelSectionsChange}
          clearMeasureNonce={clearMeasureNonce}
        />
        {compileModelUrl ? (
          <div
            className={`model-transform-panel ${isDraggingTransformPanel ? "dragging" : ""}`}
            style={{ left: transformPanelPosition.x, top: transformPanelPosition.y }}
          >
            <div
              className="model-transform-drag-handle"
              onPointerDown={handleTransformPanelPointerDown}
              title="Drag to move panel"
            >
              <span>Transform</span>
              <button
                type="button"
                className="model-transform-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTransformPanel();
                }}
                aria-label={isTransformPanelExpanded ? "Collapse transform panel" : "Expand transform panel"}
                title={isTransformPanelExpanded ? "Collapse" : "Expand"}
              >
                {isTransformPanelExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
            {isTransformPanelExpanded ? (
              <>
            <div className="model-transform-row">
              <span className="model-transform-label">Pos</span>
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={compileModelPosition[0]}
                onChange={(e) => updateModelPositionAxis(0, e.target.value)}
                aria-label="Position X"
              />
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={compileModelPosition[1]}
                onChange={(e) => updateModelPositionAxis(1, e.target.value)}
                aria-label="Position Y"
              />
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={compileModelPosition[2]}
                onChange={(e) => updateModelPositionAxis(2, e.target.value)}
                aria-label="Position Z"
              />
            </div>
            <div className="model-transform-row">
              <span className="model-transform-label">Rot</span>
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={toDegrees(compileModelRotation[0]).toFixed(1)}
                onChange={(e) => updateModelRotationAxisDeg(0, e.target.value)}
                aria-label="Rotation X degrees"
              />
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={toDegrees(compileModelRotation[1]).toFixed(1)}
                onChange={(e) => updateModelRotationAxisDeg(1, e.target.value)}
                aria-label="Rotation Y degrees"
              />
              <input
                type="number"
                className="model-transform-input"
                step="1"
                value={toDegrees(compileModelRotation[2]).toFixed(1)}
                onChange={(e) => updateModelRotationAxisDeg(2, e.target.value)}
                aria-label="Rotation Z degrees"
              />
            </div>
            <div className="model-transform-row">
              <span className="model-transform-label">Scale</span>
              <input
                type="number"
                className="model-transform-input"
                step="0.1"
                min="0.1"
                value={compileModelScale[0]}
                onChange={(e) => updateModelScaleAxis(0, e.target.value)}
                aria-label="Scale X"
              />
              <input
                type="number"
                className="model-transform-input"
                step="0.1"
                min="0.1"
                value={compileModelScale[1]}
                onChange={(e) => updateModelScaleAxis(1, e.target.value)}
                aria-label="Scale Y"
              />
              <input
                type="number"
                className="model-transform-input"
                step="0.1"
                min="0.1"
                value={compileModelScale[2]}
                onChange={(e) => updateModelScaleAxis(2, e.target.value)}
                aria-label="Scale Z"
              />
            </div>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-text"
              onClick={handleCenterModelPosition}
            >
              Center XYZ
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-text"
              onClick={handleResetModelTransform}
            >
              Reset Transform
            </button>
            <div className="model-transform-title">Section Colors</div>
            <div className="model-transform-row model-transform-row-color">
              <span className="model-transform-label">Part</span>
              <Select
                value={selectedSectionId}
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedSectionId(value);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Select section to color">
                  <SelectValue placeholder="Part" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    {modelSectionOptions.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <input
                type="color"
                className="model-transform-color"
                value={activeSectionColor}
                onChange={(e) => handleSectionColorChange(e.target.value)}
                aria-label="Section color"
              />
            </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="chat-panel">
        <header className="chat-header">
          AI Chat
          <button
            type="button"
            className="chat-refresh chat-save-btn"
            onClick={handleStartNew}
            title="Clear current session and start new chat"
          >
            <Plus size={12} />
            New Chat
          </button>
          <button
            type="button"
            className="chat-refresh chat-save-btn chat-header-action"
            onClick={() => void handleSaveModel()}
            disabled={!latestCompileJobId || isSending}
            title="Save current model to Supabase"
          >
            <Save size={13} />
            {saveStatus === "saving..." ? "Saving..." : "Save"}
          </button>
          <Link
            href={`/chat-history/${sessionId}?user_id=${encodeURIComponent(userId)}`}
            className="chat-icon-btn"
            title="Open chat history"
            aria-label="Open chat history"
          >
            <Clock3 size={15} />
          </Link>
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
          {saveStatus ? <div className="compile-status">Save: {saveStatus}</div> : null}
          {compilePreviewUrl ? (
            <img src={compilePreviewUrl} className="compile-preview" alt="compile preview" />
          ) : null}
        </div>
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Describe your model or ask for an edit..."
            className="chat-input"
            disabled={isSending}
          />
          <button
            type="button"
            className={`chat-mic-icon ${isListening ? "active" : ""}`}
            onClick={() => void handleToggleMic()}
            disabled={!speechSupported || isSending}
            aria-label={isListening ? "Stop microphone input" : "Start microphone input"}
            title={
              speechSupported
                ? "Use microphone to fill prompt"
                : "Speech recognition is not supported in this browser"
            }
          >
            {isListening ? <Square size={14} /> : <Mic size={14} />}
          </button>
          <button type="submit" className="chat-send" disabled={isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </aside>
    </main>
  );
}
