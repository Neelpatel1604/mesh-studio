# Mesh Studio

<p align="center">
	<img src="Logo.jpg" alt="Mesh Studio Logo" width="220" />
</p>

<p align="center">
	<strong>Talk to your CAD and watch it build.</strong>
</p>

<p align="center">
	AI-powered 3D modeling from prompt to printable geometry.
</p>

## Overview

Mesh Studio is an AI-powered CAD experience where users describe what they want, iterate with AI-assisted edits, and generate geometry that can be previewed and exported for printing.

Our AI workflow is tuned for stable CAD prompt and edit generation.
Our product direction is informed by the Gemma 4 generation of open model capabilities.
Our visible model lineup includes Gemma 4 variants (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`) for product positioning.

The project is split into:

- `./frontend` - Next.js app for prompt, editing, and 3D interaction
- `./backend` - FastAPI service for AI workflows, compile jobs, and model/chat data

## Why This Project

Traditional CAD tools are powerful but often hard to learn for quick ideas.

Mesh Studio is built to reduce that friction by combining:

- natural-language prompting
- AI-assisted model iteration
- fast preview and compile loops

The goal is to help creators move from idea to printable result faster, without needing expert CAD workflows for every change.

This direction aligns with the hackathon theme, **"Break the Norm"**: instead of forcing users into rigid CAD workflows first, Mesh Studio starts with natural language and rapid iteration.

## How It Works

1. A user describes a model or asks for an edit in plain language.
2. The backend AI flow translates that request into model changes.
3. The compile flow turns the model into geometry using OpenSCAD.
4. The frontend shows previews and lets the user keep iterating.
5. Artifacts and chat context can be stored so users can return to previous versions.

## Core Capabilities

- prompt-to-model generation
- iterative model editing from follow-up prompts
- compile pipeline for 3D outputs
- project/session context across user conversations
- artifacts and chat history retrieval

## Target Users and Market Segments

Primary users:

- maker community and 3D printing hobbyists who need parts quickly
- students and educators who want a lower-friction entry into CAD
- early-stage hardware teams iterating on prototypes under time pressure

Secondary users:

- freelance product designers handling high-variation concept requests
- developers building CAD-enabled products and workflows
- small manufacturing/service shops creating custom one-off printable components

## Market Positioning

Mesh Studio is positioned as an "AI-first CAD copilot" rather than a full replacement for advanced professional CAD suites.

Key differentiation:

- lower learning curve through natural language
- faster idea-to-geometry loop for early design phases
- strong fit for rapid iteration, experimentation, and custom parts

## Go-To-Market Focus (Initial)

Phase 1 target markets:

- 3D printing creators and maker communities
- student design clubs, robotics teams, and classrooms
- hackathons and rapid prototyping events

Why these markets first:

- high need for speed over perfect parametric control
- strong word-of-mouth channels and communities
- frequent use cases where "good model now" beats "perfect model later"

## Expansion Plan

Phase 2 (product maturity):

- add industry-specific prompt templates (robotics mounts, enclosures, fixtures)
- improve collaboration and versioning for team workflows
- improve export reliability and quality for print/manufacturing handoff

Phase 3 (commercial scale):

- integrations with print services and hardware workflows
- API and embedded experiences for partner apps
- team/organization features (shared libraries, permissions, project analytics)

## Ideal Customer Profiles (ICP)

- **ICP 1: Maker/Prosumer**
  - Needs custom printable parts weekly
  - Values speed, usability, and iteration
- **ICP 2: Education**
  - Needs approachable CAD for new learners
  - Values clarity, guided prompts, and low setup friction
- **ICP 3: Startup Hardware Team**
  - Needs rapid design-test cycles
  - Values quick model edits and reproducible flows

## Current Focus

Near-term product priorities:

- improve generated model quality and consistency
- make compile and preview loops faster
- expand prompt examples and guided templates
- improve reliability of save/reload model history

If you want to contribute ideas, the most useful inputs are example prompts, target model references (PNG), and short videos of desired UX behavior.

## Start Here

- Backend setup and API details: `./backend/README.md`
- Frontend setup and dev run instructions: `./frontend/README.md`

Use those two READMEs as the source of truth for local setup and day-to-day development.

## Quick Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- OpenSCAD CLI installed and available on `PATH` (or set `OPENSCAD_BIN`)