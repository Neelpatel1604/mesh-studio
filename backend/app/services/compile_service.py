import threading
import time
import uuid

from app.schemas.compile import CompileRequest


class CompileService:
    def __init__(self) -> None:
        self.jobs: dict[str, dict] = {}

    def create_job(self, payload: CompileRequest) -> str:
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "warnings": [],
            "output": None,
            "error": None,
            "cancelled": False,
        }
        thread = threading.Thread(
            target=self._run_sync,
            args=(job_id, payload.source_code),
            daemon=True,
        )
        thread.start()
        return job_id

    def _run_sync(self, job_id: str, source_code: str) -> None:
        self.jobs[job_id]["status"] = "running"
        time.sleep(0.1)
        if self.jobs[job_id]["cancelled"]:
            self.jobs[job_id]["status"] = "cancelled"
            return
        warnings = []
        if "TODO" in source_code:
            warnings.append("Source contains TODO marker.")
        self.jobs[job_id]["status"] = "completed"
        self.jobs[job_id]["warnings"] = warnings
        self.jobs[job_id]["output"] = {
            "part_count": max(1, source_code.count("module")),
            "preview": source_code[:120],
        }

    def get_job(self, job_id: str) -> dict | None:
        return self.jobs.get(job_id)

    def cancel_job(self, job_id: str) -> dict | None:
        job = self.jobs.get(job_id)
        if not job:
            return None
        job["cancelled"] = True
        if job["status"] in {"queued", "running"}:
            job["status"] = "cancelled"
        return job
