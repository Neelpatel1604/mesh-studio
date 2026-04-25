# Mesh Editor Research Notes

This document captures current research direction for evolving Mesh Studio from a viewport into a web-first 3D object editor.

## Core Idea

A mesh should be treated as editable data, not only as a static asset.  
By exposing geometry, materials, and scene hierarchy, AI-generated models become inspectable, transformable, and exportable.

## 1) Anatomy of an AI Mesh

When the app ingests `.glb` or `.obj`, it should separate model data into three layers:

- **Geometry (Skeleton)**  
  `BufferGeometry` with vertex attributes (`position`, `normal`, `uv`, indices).  
  Used for deformation, bounds computation, snap-to-grid, collision checks, and precision edits.

- **Material (Skin)**  
  Usually `MeshStandardMaterial`.  
  Controls viewport response to lighting (albedo/baseColor, roughness, metalness, normal maps, etc.).

- **Scene Graph (Hierarchy)**  
  Node tree with nested transforms.  
  Enables selecting and editing specific sub-meshes (example: only car wheels, not the full car body).

## 2) Manipulation Pipeline (Visual -> Data)

The editor loop should convert every user interaction into deterministic data updates:

1. **Raycasting / Picking**  
   User clicks object; `Raycaster` resolves hit mesh + face + optional barycentric context.

2. **Transform Editing**  
   User drags handles/gizmo; update local/world `Matrix4` through position, rotation, scale channels.

3. **Vertex Editing**  
   For fine edits, modify `geometry.attributes.position` directly, then flag updates.

4. **Serialization / State Sync**  
   Persist updates into a JSON editor state to support undo/redo, autosave, collaboration, and code export.

## 3) Code Automation Concept

Visual edits should mirror code state in real time:

- **Prop Mapping**  
  Bind transform/material channels to React state.  
  Example:
  - User scales model to `1.5`
  - Generated code: `<Model scale={1.5} />`

- **Live Geometry Export**  
  After vertex edits, run exporter flow (for example GLTF export) so users can download a modified mesh artifact.

## 4) Known Technical Challenges + Solutions

- **Normals Recalculation**  
  After vertex edits, recompute normals to keep shading correct (`computeVertexNormals` flow).

- **Origin / Pivot Offsets**  
  Many AI assets have offset pivots.  
  Provide recentering utilities (`center geometry`, `set pivot`, `reset transform`) so gizmos appear where expected.

## 5) Important Improvements to Add

These are high-value additions for a production-grade web editor:

- **Undo/Redo Command Stack**  
  Use command pattern per action (`transform`, `vertexMove`, `materialChange`) with compact diffs.

- **Non-Destructive Editing Layers**  
  Keep base imported geometry immutable; store modifiers/overrides separately where possible.

- **Selection Model**  
  Support object, sub-mesh, and vertex/face/edge selection modes with clear visual highlighting.

- **Transform Spaces + Snapping**  
  Local/world toggle, axis constraints, angle snap, scale snap, grid snap.

- **Performance Strategy**  
  Throttle expensive updates, avoid per-frame allocations, and isolate edit mode from navigation mode.

- **Robust Serialization Format**  
  Store canonical editor state:
  - scene node ids and parent links
  - transforms
  - material overrides
  - geometry deltas (or references)
  - metadata/version for migration

- **Autosave + Recovery**  
  Save draft state to local storage/session periodically and recover on crash/reload.

- **Import Normalization Pass**  
  On model load:
  - validate scale units
  - fix handedness/up-axis if needed
  - compute bounds
  - optional recenter/ground
  - generate stable IDs per node

- **Export Profiles**  
  Provide export presets:
  - web-optimized (compressed textures / mesh compression)
  - editable (retains metadata and higher precision)

- **Validation Hooks**  
  Before export:
  - check NaNs/infinite transforms
  - verify non-empty geometry
  - ensure material references are valid

## 6) Suggested MVP Milestones

1. Object selection + transform gizmo + snap
2. Undo/redo for transforms
3. Material inspector + state binding
4. Vertex edit mode (basic move + normals refresh)
5. Export edited GLB + generate React snippet

## 7) Practical Note for Current Project

The current Next.js frontend viewport already provides a strong base:
- orbit navigation
- infinite grid
- stage grounding logic
- axis cues

Next step is layering editor state + interaction systems on top of this viewport, not replacing it.
