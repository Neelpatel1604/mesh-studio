# Mesh Studio Python Backend

FastAPI service that exposes AI, compile, session, and upload endpoints for the frontend.

## Run

```powershell
Set-Location "C:\Users\patel\Downloads\side-projects\Berahacks\mesh-studio\backend"; python -m venv ".venv"; ".\.venv\Scripts\Activate.ps1"; pip install -e ".[dev]"; uvicorn --app-dir "C:\Users\patel\Downloads\side-projects\Berahacks\mesh-studio\backend" app.main:app --reload --host 0.0.0.0 --port 8000
```
