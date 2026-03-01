# Active Context: Next.js Starter Template

## Current State

**Template Status**: ✅ Ready for development

The template is a clean Next.js 16 starter with TypeScript and Tailwind CSS 4. It's ready for AI-assisted expansion to build any type of application.

## Recently Completed

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript configuration with strict mode
- [x] Tailwind CSS 4 integration
- [x] ESLint configuration
- [x] Memory bank documentation
- [x] Recipe system for common features
- [x] **OrthoScan Pro** — 3D orthodontic bracket placement UI
  - Three.js 3D dental arch viewer with interactive tooth selection
  - AI segmentation pipeline panel with animated step progress
  - FDI tooth chart (upper/lower jaw) with bracket status indicators
  - Bracket properties panel with MBT prescription values
  - Torque/angulation/in-out fine adjustment sliders
  - Floating viewer toolbar (3D/Front/Top/Side views, grid, wireframe)
  - Bracket placement tools (select/place/move)
  - Auto-place all brackets with prescription
  - Archwire visualization when multiple brackets placed
  - Modern dark theme (navy/blue/cyan) with collapsible sidebars

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Renders OrthoApp | ✅ Ready |
| `src/app/layout.tsx` | Root layout | ✅ Ready |
| `src/app/globals.css` | Dark theme + custom CSS vars | ✅ Ready |
| `src/components/OrthoApp.tsx` | Main app shell + state | ✅ Ready |
| `src/components/ThreeViewer.tsx` | Three.js 3D dental viewer | ✅ Ready |
| `src/components/SegmentationPanel.tsx` | AI segmentation pipeline UI | ✅ Ready |
| `src/components/ToothChart.tsx` | FDI tooth chart sidebar | ✅ Ready |
| `src/components/BracketProperties.tsx` | Bracket adjustment panel | ✅ Ready |
| `src/components/ViewerToolbar.tsx` | Floating viewer toolbar | ✅ Ready |
| `.kilocode/` | AI context & recipes | ✅ Ready |

## Current Focus

OrthoScan Pro — advanced bracket planning features implemented:
- **Light clinical theme** (white/slate palette, bright 3D viewport)
- **STL / OBJ / PLY import** via Three.js loaders + drag-and-drop on viewport
- **Patient-specific bracket base** — curved pad geometry conforming to labial surface
- **Ideal arch form slot alignment** — Bonwill-Hawley parabolic arch; bracket slots oriented tangent to arch curve (OCS alignment)
- **Occlusal plane alignment** — `computeOCSMatrix()` derives WCS→OCS transform from 3 landmarks; OCS axes visualised in viewport; auto-detected on mesh import

## Quick Start Guide

### To add a new page:

Create a file at `src/app/[route]/page.tsx`:
```tsx
export default function NewPage() {
  return <div>New page content</div>;
}
```

### To add components:

Create `src/components/` directory and add components:
```tsx
// src/components/ui/Button.tsx
export function Button({ children }: { children: React.ReactNode }) {
  return <button className="px-4 py-2 bg-blue-600 text-white rounded">{children}</button>;
}
```

### To add a database:

Follow `.kilocode/recipes/add-database.md`

### To add API routes:

Create `src/app/api/[route]/route.ts`:
```tsx
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Hello" });
}
```

## Available Recipes

| Recipe | File | Use Case |
|--------|------|----------|
| Add Database | `.kilocode/recipes/add-database.md` | Data persistence with Drizzle + SQLite |

## Pending Improvements

- [ ] Add more recipes (auth, email, etc.)
- [ ] Add example components
- [ ] Add testing setup recipe

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
