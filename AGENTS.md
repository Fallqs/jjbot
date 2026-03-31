# AGENTS.md — jjbot

> Agent-focused guide for the `jjbot` project. If you are an AI coding agent, read this first.

---

## Project Overview

`jjbot` is a static web application that provides a clean, mirror-style reading experience for Chinese web novels (specifically styled after 晋江文学城 / JJWXC). The entire application lives under the `app/` directory and is built as a single-page React app.

- **Product name**: 晋江文学城镜像站 (JJWXC Mirror Site)
- **Displayed novel**: *欢迎进入梦魇直播间* by *桑沃*
- **Novel data**: Hard-coded in `src/data/novelData.ts` (includes metadata, tags, summary, and full chapter content)
- **Key features**:
  - Landing page with novel info, stats, tags, and chapter directory
  - Full-screen reader with chapter navigation, table of contents, and customizable settings
  - Reader settings: font size (12–32px), line height (1.5/1.8/2.0/2.5), and theme (light / dark / sepia / green)
  - Auto-hiding top/bottom nav bars on scroll

---

## Technology Stack

| Layer | Tech |
|-------|------|
| Runtime / Build | Node.js 20, Vite 7.2.4 |
| Framework | React 19.2.0 (StrictMode) |
| Language | TypeScript ~5.9.3 |
| Styling | Tailwind CSS 3.4.19, CSS variables |
| UI Components | shadcn/ui (New York style, 40+ components) |
| UI Primitives | Radix UI |
| Icons | Lucide React |
| Forms / Validation | react-hook-form, zod |
| Charts | recharts |
| Carousel | embla-carousel-react |
| Date handling | date-fns |

---

## Directory Structure

```
app/
├── index.html                 # HTML entry point
├── vite.config.ts             # Vite config (base: './', @/ -> ./src)
├── tailwind.config.js         # Tailwind theme + shadcn color tokens
├── postcss.config.js          # Tailwind + autoprefixer
├── eslint.config.js           # ESLint flat config
├── tsconfig.json              # Project references (app + node)
├── tsconfig.app.json          # App TS config (strict, bundler mode)
├── tsconfig.node.json         # Node/Vite TS config
├── components.json            # shadcn/ui registry config
├── package.json
├── package-lock.json
├── dist/                      # Pre-built static output
├── src/
│   ├── main.tsx               # React root render
│   ├── App.tsx                # Landing page + chapter list
│   ├── App.css                # App-specific styles
│   ├── index.css              # Global styles + CSS variables
│   ├── sections/
│   │   └── Reader.tsx         # Full-screen reading view
│   ├── data/
│   │   └── novelData.ts       # Embedded novel content
│   ├── components/ui/         # 50+ shadcn/ui components
│   ├── hooks/
│   │   └── use-mobile.ts      # useIsMobile hook
│   └── lib/
│       └── utils.ts           # cn() utility (clsx + tailwind-merge)
```

---

## Build and Development Commands

All commands should be run from the `app/` directory:

```bash
cd app

# Install dependencies
npm install

# Start dev server (Vite)
npm run dev

# Production build (tsc + vite build)
npm run build

# Preview production build locally
npm run preview

# Lint
npm run lint
```

- The build outputs to `app/dist/`.
- `vite.config.ts` sets `base: './'`, so the built app can be opened directly from the filesystem or served from any path.
- A pre-built `dist/` folder already exists in the repo.

---

## Code Style Guidelines

- **Imports**: Use the `@/` path alias for everything under `src/`.
  - Example: `import { Button } from '@/components/ui/button'`
- **Component style**: Functional components, default exports for page sections, named exports for UI utilities.
- **Tailwind classes**: Use the `cn()` utility from `@/lib/utils` when merging conditional classes.
- **TypeScript**: Strict mode is enabled. Avoid unused locals/parameters. Use `type` over `interface` where preferred by existing code.
- **shadcn/ui conventions**: Components live in `src/components/ui/`. Do not modify the internal structure of shadcn components unless necessary; wrap them in feature components instead.
- **CSS theming**: Colors are HSL CSS variables defined in `src/index.css` and mapped in `tailwind.config.js`. Supports `.dark` class toggling.

---

## Testing Instructions

- **No test framework is currently configured.**
- There are no `.test.*` or `.spec.*` files in the project.
- If you add tests, prefer **Vitest** (aligns with the Vite ecosystem) or **Jest**. Place tests next to the files they test or under a `src/__tests__/` directory.

---

## Architecture Notes

- **Single-page app with two views**: `App.tsx` acts as a router-lite. It conditionally renders either the landing page or `<Reader />` based on local `isReading` state.
- **State management**: All state is local React state (hooks). No external state library (Redux, Zustand, etc.) is used.
- **Data source**: The novel is fully embedded in `src/data/novelData.ts`. There is no backend API, no fetch logic, and no dynamic data loading.
- **Reader formatting**: `Reader.tsx` splits chapter content by double newlines (`\n\n`) and applies different paragraph styles:
  - Dialogue (starts with `"`, `「`, `『`) → indent-0 with left padding
  - System messages (wrapped in `【…】`) → centered, slightly smaller font
  - Narrative → standard indent-8

---

## Security Considerations

- This is a **demo / mirror site**. The footer explicitly states: "本站点仅为演示用途，所有内容版权归原网站所有" (This site is for demonstration only; all content copyrights belong to the original website).
- No authentication, no user data collection, and no server-side logic.
- If extending the app with real backend integration or user accounts, add proper CSP headers, input sanitization, and copyright compliance checks.

---

## Adding New shadcn/ui Components

If you need to add more shadcn components, ensure the CLI is run from the `app/` directory (or install manually by copying the component into `src/components/ui/` and adding any required dependencies to `package.json`).

---

## Quick Reference for Agents

- Want to change the displayed novel? Edit `src/data/novelData.ts`.
- Want to change reader behavior? Edit `src/sections/Reader.tsx`.
- Want to change the landing page? Edit `src/App.tsx`.
- Want to change colors or themes? Edit `src/index.css` (variables) and `tailwind.config.js` (mappings).
- Want to add a new page/section? Create a file under `src/sections/` and import it in `App.tsx`.
