import json
import subprocess
import threading
import uuid
import shutil
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import settings
from app.schemas.compile import CompileRequest
from app.services.artifact_registry_service import ArtifactRegistryService


class CompileService:
    def __init__(self, artifact_registry_service: ArtifactRegistryService | None = None) -> None:
        self.jobs: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._artifact_registry_service = artifact_registry_service
        self._artifacts_root = settings.storage_dir / "compile_artifacts"
        self._artifacts_root.mkdir(parents=True, exist_ok=True)
        self._jobs_snapshot_path = settings.storage_dir / "compile_jobs.json"
        self._load_jobs_snapshot()

    def create_job(self, payload: CompileRequest) -> str:
        job_id = str(uuid.uuid4())
        with self._lock:
            self.jobs[job_id] = {
                "job_id": job_id,
                "status": "queued",
                "warnings": [],
                "output": None,
                "error": None,
                "cancelled": False,
                "process": None,
                "created_at": time.time(),
                "user_id": payload.user_id,
            }
        self._save_jobs_snapshot()
        thread = threading.Thread(
            target=self._run_sync,
            args=(job_id, payload.source_code, payload.user_id),
            daemon=True,
        )
        thread.start()
        return job_id

    def _run_sync(self, job_id: str, source_code: str, user_id: str | None) -> None:
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return
            job["status"] = "running"
        self._save_jobs_snapshot()

        with TemporaryDirectory(prefix="meshstudio_compile_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            scad_path = tmp_path / "model.scad"
            stl_path = tmp_path / "model.stl"
            three_mf_path = tmp_path / "model.3mf"
            preview_path = tmp_path / "preview.png"
            scad_path.write_text(source_code, encoding="utf-8")
            source_len = len(source_code)
            is_heavy_source = (
                settings.compile_skip_3mf_preview_for_heavy
                and source_len >= settings.compile_heavy_source_threshold_chars
            )

            if self._is_cancelled(job_id):
                self._mark_cancelled(job_id)
                return

            stl_process = self._spawn_openscad_process(
                [
                    settings.openscad_bin,
                    "-o",
                    str(stl_path),
                    str(scad_path),
                ]
            )
            if isinstance(stl_process, Exception):
                self._mark_error(job_id, f"Failed to start OpenSCAD: {stl_process}")
                return

            self._set_process(job_id, stl_process)
            try:
                stl_stdout, stl_stderr = stl_process.communicate(
                    timeout=settings.compile_timeout_sec
                )
            except subprocess.TimeoutExpired:
                stl_process.kill()
                self._mark_error(job_id, "OpenSCAD STL compile timed out.")
                return
            finally:
                self._clear_process(job_id)

            if self._is_cancelled(job_id):
                self._mark_cancelled(job_id)
                return
            if stl_process.returncode != 0:
                combined_err = f"{stl_stderr.strip()} {stl_stdout.strip()}".strip()
                if "Current top level object is not a 3D object" in combined_err:
                    self._mark_error(
                        job_id,
                        "OpenSCAD STL compile failed: model is 2D at top level. "
                        "Please generate a 3D object (e.g. linear_extrude(...) or a 3D primitive).",
                    )
                    return
                self._mark_error(
                    job_id,
                    f"OpenSCAD STL compile failed: {stl_stderr.strip() or stl_stdout.strip()}",
                )
                return

            warnings: list[str] = []
            preview_generated = False
            if is_heavy_source:
                warnings.append(
                    "Heavy model detected; skipped 3MF and preview generation for faster compile."
                )
            else:
                three_mf_process = self._spawn_openscad_process(
                    [
                        settings.openscad_bin,
                        "-o",
                        str(three_mf_path),
                        str(scad_path),
                    ]
                )
                if isinstance(three_mf_process, Exception):
                    warnings.append(f"3MF generation skipped: {three_mf_process}")
                else:
                    self._set_process(job_id, three_mf_process)
                    try:
                        _, three_mf_stderr = three_mf_process.communicate(
                            timeout=settings.compile_timeout_sec
                        )
                        if three_mf_process.returncode != 0 and three_mf_stderr.strip():
                            warnings.append(f"3MF generation warning: {three_mf_stderr.strip()}")
                    except subprocess.TimeoutExpired:
                        three_mf_process.kill()
                        warnings.append("3MF generation timed out.")
                    finally:
                        self._clear_process(job_id)

                png_process = self._spawn_openscad_process(
                    [
                        settings.openscad_bin,
                        "--render",
                        "--viewall",
                        "--imgsize",
                        "512,512",
                        "-o",
                        str(preview_path),
                        str(scad_path),
                    ]
                )
                if isinstance(png_process, Exception):
                    warnings.append(f"Preview generation skipped: {png_process}")
                else:
                    self._set_process(job_id, png_process)
                    try:
                        _, png_stderr = png_process.communicate(
                            timeout=settings.compile_timeout_sec
                        )
                        preview_generated = png_process.returncode == 0 and preview_path.exists()
                        if png_process.returncode != 0 and png_stderr.strip():
                            warnings.append(
                                f"Preview generation warning: {png_stderr.strip()}"
                            )
                    except subprocess.TimeoutExpired:
                        png_process.kill()
                        warnings.append("Preview generation timed out.")
                    finally:
                        self._clear_process(job_id)

            output = {
                "engine": "openscad-cli",
                "stl_generated": False,
                "model_3mf_generated": False,
                "preview_generated": preview_generated,
                "stl_path": None,
                "model_3mf_path": None,
                "preview_path": None,
                "stl_url": None,
                "model_3mf_url": None,
                "preview_url": None,
                "orientation": {
                    "up_axis": "z",
                    "mesh_rotation_euler": [-1.57079632679, 0.0, 0.0],
                },
            }
            job_artifacts_dir = self._artifacts_root / job_id
            job_artifacts_dir.mkdir(parents=True, exist_ok=True)
            if stl_path.exists():
                final_stl = job_artifacts_dir / "model.stl"
                shutil.copy2(stl_path, final_stl)
                output["stl_generated"] = True
                output["stl_path"] = str(final_stl)
                output["stl_url"] = f"/artifacts/{job_id}/model.stl"
            if three_mf_path.exists():
                final_3mf = job_artifacts_dir / "model.3mf"
                shutil.copy2(three_mf_path, final_3mf)
                output["model_3mf_generated"] = True
                output["model_3mf_path"] = str(final_3mf)
                output["model_3mf_url"] = f"/artifacts/{job_id}/model.3mf"
            if preview_generated and preview_path.exists():
                final_preview = job_artifacts_dir / "preview.png"
                shutil.copy2(preview_path, final_preview)
                output["preview_path"] = str(final_preview)
                output["preview_url"] = f"/artifacts/{job_id}/preview.png"
            cancelled_after_compile = False
            with self._lock:
                job = self.jobs.get(job_id)
                if not job:
                    return
                if job["cancelled"]:
                    job["status"] = "cancelled"
                    cancelled_after_compile = True
                else:
                    job["status"] = "completed"
                    job["warnings"] = warnings
                    job["output"] = output
            if cancelled_after_compile:
                self._save_jobs_snapshot()
                return
            self._save_jobs_snapshot()

    def get_job(self, job_id: str) -> dict | None:
        needs_snapshot = False
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return None
            output = job.get("output")
            if isinstance(output, dict):
                if self._normalize_output_orientation(output):
                    needs_snapshot = True
            if job.get("status") == "running":
                created_at = float(job.get("created_at", time.time()))
                max_running = max(120, settings.compile_timeout_sec * 2)
                if (time.time() - created_at) > max_running:
                    job["status"] = "failed"
                    job["error"] = (
                        "Compile job exceeded watchdog limit; process likely stuck. "
                        "Please retry and ensure OpenSCAD path is configured in backend process."
                    )
                    job["process"] = None
                    needs_snapshot = True
        if needs_snapshot:
            self._save_jobs_snapshot()
        return job

    def cancel_job(self, job_id: str) -> dict | None:
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return None
            job["cancelled"] = True
            process = job.get("process")
            if process is not None and process.poll() is None:
                process.terminate()
            if job["status"] in {"queued", "running"}:
                job["status"] = "cancelled"
        self._save_jobs_snapshot()
        return job

    def _spawn_openscad_process(self, cmd: list[str]) -> subprocess.Popen | Exception:
        try:
            resolved_bin = self._resolve_openscad_bin(cmd[0])
            cmd = [resolved_bin, *cmd[1:]]
            return subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except Exception as exc:  # noqa: BLE001
            return exc

    def _resolve_openscad_bin(self, configured_bin: str) -> str:
        configured_path = Path(configured_bin)
        if configured_path.is_file():
            return str(configured_path)

        for candidate in [configured_bin, "openscad", "openscad.exe"]:
            resolved = shutil.which(candidate)
            if resolved:
                return resolved

        windows_candidates = [
            Path(r"C:\Program Files\OpenSCAD\openscad.exe"),
            Path(r"C:\Program Files (x86)\OpenSCAD\openscad.exe"),
        ]
        for candidate in windows_candidates:
            if candidate.is_file():
                return str(candidate)

        raise FileNotFoundError(
            "OpenSCAD executable not found. Set OPENSCAD_BIN to full path, "
            r'e.g. C:\Program Files (x86)\OpenSCAD\openscad.exe'
        )

    def _is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self.jobs.get(job_id)
            return bool(job and job["cancelled"])

    def _set_process(self, job_id: str, process: subprocess.Popen) -> None:
        with self._lock:
            job = self.jobs.get(job_id)
            if job:
                job["process"] = process

    def _clear_process(self, job_id: str) -> None:
        with self._lock:
            job = self.jobs.get(job_id)
            if job:
                job["process"] = None

    def _mark_error(self, job_id: str, error_msg: str) -> None:
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return
            job["status"] = "failed"
            job["error"] = error_msg
        self._save_jobs_snapshot()

    def _mark_cancelled(self, job_id: str) -> None:
        with self._lock:
            job = self.jobs.get(job_id)
            if not job:
                return
            job["status"] = "cancelled"
        self._save_jobs_snapshot()

    def _load_jobs_snapshot(self) -> None:
        if not self._jobs_snapshot_path.exists():
            return
        try:
            raw = json.loads(self._jobs_snapshot_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return
        if not isinstance(raw, dict):
            return
        for job_id, job in raw.items():
            if not isinstance(job, dict):
                continue
            self.jobs[job_id] = {
                "job_id": job.get("job_id", job_id),
                "status": job.get("status", "failed"),
                "warnings": job.get("warnings", []),
                "output": job.get("output"),
                "error": job.get("error"),
                "cancelled": job.get("cancelled", False),
                "process": None,
                "created_at": job.get("created_at", time.time()),
                "user_id": job.get("user_id"),
            }
            output = self.jobs[job_id].get("output")
            if isinstance(output, dict):
                self._normalize_output_orientation(output)

    def _save_jobs_snapshot(self) -> None:
        with self._lock:
            serializable: dict[str, dict] = {}
            for job_id, job in self.jobs.items():
                serializable[job_id] = {
                    "job_id": job.get("job_id", job_id),
                    "status": job.get("status"),
                    "warnings": job.get("warnings", []),
                    "output": job.get("output"),
                    "error": job.get("error"),
                    "cancelled": job.get("cancelled", False),
                    "created_at": job.get("created_at", time.time()),
                    "user_id": job.get("user_id"),
                }
        self._jobs_snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        self._jobs_snapshot_path.write_text(
            json.dumps(serializable, indent=2),
            encoding="utf-8",
        )

    def _normalize_output_orientation(self, output: dict) -> bool:
        """
        Ensure compile output orientation is usable by frontend.
        Returns True when output is modified.
        """
        changed = False
        orientation = output.get("orientation")
        if not isinstance(orientation, dict):
            output["orientation"] = {
                "up_axis": "z",
                "mesh_rotation_euler": [-1.57079632679, 0.0, 0.0],
            }
            return True

        up_axis = orientation.get("up_axis")
        euler = orientation.get("mesh_rotation_euler")
        is_zero_euler = (
            isinstance(euler, list)
            and len(euler) == 3
            and all(abs(float(v)) < 1e-9 for v in euler)
        )
        if up_axis == "z" and is_zero_euler:
            orientation["mesh_rotation_euler"] = [-1.57079632679, 0.0, 0.0]
            changed = True
        return changed
