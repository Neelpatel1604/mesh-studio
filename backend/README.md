# Mesh Studio Backend (FastAPI)

This backend powers Mesh Studio's AI-assisted CAD workflow.

It receives user prompts, generates and edits model code, compiles geometry through OpenSCAD, and stores model/chat metadata so the frontend can load project history.

## Project Overview

Main responsibilities:

- AI prompt-to-model and model-edit flows
- compile jobs for preview/printable outputs
- user artifact persistence and retrieval
- chat history persistence per user/chat

## Tech Stack

- Python 3.11+
- FastAPI + Uvicorn
- We use a stability-tuned AI runtime for chat/model-edit generation
- We benchmark product direction against Gemma 4 class capabilities
- OpenSCAD CLI for geometry compilation
- optional Supabase tables for artifact/chat storage

## Prerequisites

- Python 3.11 or newer
- OpenSCAD installed and available on `PATH`
  - If not on `PATH`, set `OPENSCAD_BIN` in your environment

## Quick Start

Run in PowerShell:

```powershell
Set-Location "./backend"
python -m venv ".venv"
& ".\.venv\Scripts\Activate.ps1"
pip install -e ".[dev]"
uvicorn --app-dir "." app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend base URL: `http://127.0.0.1:8000`

## Core API Flow

- Send prompt/edit requests to AI endpoints
- Compile generated model via `POST /compile` (include `user_id`)
- Save a result when needed via `POST /users/{user_id}/artifacts/save`
- Read saved artifacts via `GET /users/{user_id}/artifacts`
- Read chat history:
  - `GET /chat-history?user_id=...`
  - `GET /chat-history/{chat_id}?user_id=...`

## Supabase (Optional but Recommended)

Set these environment variables to persist artifacts:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ARTIFACTS_TABLE` (optional, default `compile_artifacts`)

Suggested `compile_artifacts` table:

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

Suggested `chat_messages` table:

```sql
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  chat_id text not null,
  role text not null,
  content text not null,
  compile_job_id text,
  model_url text,
  preview_url text,
  created_at timestamptz not null default now(),
  created_at_epoch double precision
);

create index if not exists chat_messages_user_chat_created_idx
  on public.chat_messages (user_id, chat_id, created_at asc);
```

## Troubleshooting

- `openscad` not found:
  - install OpenSCAD or set `OPENSCAD_BIN`
- backend starts but compile fails:
  - verify OpenSCAD path and required env vars in `.env`
- PowerShell activation blocked:
  - run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` once in the current shell

## What To Share For Next Improvements

To help plan the next iteration quickly, share:

- 2-5 example prompts you expect users to type
- PNG references for expected model look/style
- short videos/GIFs of desired interaction flow (optional)
- any output quality targets (preview quality, compile speed, export format)
