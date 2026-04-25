from pathlib import Path

from app.services.compile_service import CompileService


class _FakeProcess:
    def __init__(self, returncode: int = 0, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr
        self._terminated = False

    def communicate(self, timeout: int | None = None) -> tuple[str, str]:
        _ = timeout
        return self._stdout, self._stderr

    def poll(self) -> int | None:
        return None if not self._terminated else self.returncode

    def terminate(self) -> None:
        self._terminated = True


def test_compile_service_success(monkeypatch) -> None:
    service = CompileService()

    def fake_spawn(cmd: list[str]):
        out_path = Path(cmd[cmd.index("-o") + 1])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if out_path.suffix == ".stl":
            out_path.write_text("solid demo", encoding="utf-8")
        elif out_path.suffix == ".png":
            out_path.write_bytes(b"\x89PNG\r\n\x1a\n")
        return _FakeProcess(returncode=0)

    monkeypatch.setattr(service, "_spawn_openscad_process", fake_spawn)
    job_id = "job-success"
    service.jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "warnings": [],
        "output": None,
        "error": None,
        "cancelled": False,
        "process": None,
    }
    service._run_sync(job_id, "cube(10);")
    job = service.get_job(job_id)
    assert job is not None
    assert job["status"] == "completed"
    assert job["output"]["stl_generated"] is True
    assert job["output"]["preview_generated"] is True
    assert Path(job["output"]["stl_path"]).exists()


def test_compile_service_spawn_error(monkeypatch) -> None:
    service = CompileService()
    monkeypatch.setattr(
        service,
        "_spawn_openscad_process",
        lambda cmd: RuntimeError("openscad not found"),
    )
    job_id = "job-error"
    service.jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "warnings": [],
        "output": None,
        "error": None,
        "cancelled": False,
        "process": None,
    }
    service._run_sync(job_id, "cube(10);")
    job = service.get_job(job_id)
    assert job is not None
    assert job["status"] == "failed"
    assert "Failed to start OpenSCAD" in (job["error"] or "")
