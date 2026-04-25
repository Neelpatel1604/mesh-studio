# Mesh Studio Python Backend

FastAPI service that exposes AI, compile, session, and upload endpoints for the frontend.

## Requirements

- OpenSCAD CLI installed and available on PATH (`openscad`), or set `OPENSCAD_BIN` env var.

## Run

```powershell
Set-Location "C:\Users\patel\Downloads\side-projects\Berahacks\mesh-studio\backend"; python -m venv ".venv"; & "C:\Users\patel\Downloads\side-projects\Berahacks\mesh-studio\backend\.venv\Scripts\Activate.ps1"; pip install -e ".[dev]"; uvicorn --app-dir "C:\Users\patel\Downloads\side-projects\Berahacks\mesh-studio\backend" app.main:app --reload --host 0.0.0.0 --port 8000
```

## Supabase Artifact Registry

To persist compile artifact IDs per user, set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ARTIFACTS_TABLE` (optional, defaults to `compile_artifacts`)

Suggested table:

```sql
create table if not exists public.compile_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  compile_job_id text not null,
  stl_url text,
  model_3mf_url text,
  preview_url text,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  created_at_epoch double precision
);

create index if not exists compile_artifacts_user_id_idx
  on public.compile_artifacts (user_id, created_at desc);
```

API flow:

- Include `user_id` in `POST /compile` request body.
- Fetch saved artifacts via `GET /users/{user_id}/artifacts`.
