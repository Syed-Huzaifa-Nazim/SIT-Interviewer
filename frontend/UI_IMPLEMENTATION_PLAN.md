# Interviewer.AI — Frontend UI Overhaul Implementation Plan

> **Scope:** Visual and UX refresh of the entire `frontend/` directory.  
> **Constraint:** Zero backend changes. All API contracts, request payloads, response shapes, route paths, and auth flows remain untouched.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend Safety Boundaries](#2-backend-safety-boundaries)
3. [Current State Audit](#3-current-state-audit)
4. [Design System Specification](#4-design-system-specification)
5. [Shared Component Library (New Files)](#5-shared-component-library-new-files)
6. [Global / Config Files](#6-global--config-files)
7. [Context Files](#7-context-files)
8. [Layout Files](#8-layout-files)
9. [Public & Auth Pages](#9-public--auth-pages)
10. [Candidate Dashboard Pages](#10-candidate-dashboard-pages)
11. [Interview Flow Pages](#11-interview-flow-pages)
12. [Admin Pages](#12-admin-pages)
13. [Implementation Phases & Order](#13-implementation-phases--order)
14. [Testing Checklist](#14-testing-checklist)

---

## 1. Executive Summary

The frontend is a React 19 + Vite 8 SPA using Tailwind CSS 4, lucide-react icons, and recharts. It already follows a dark glassmorphism aesthetic with a teal-cyan primary palette defined in `index.css`, but suffers from:

- **Palette drift:** `tailwind.config.js` defines purple primary colors while `index.css @theme` defines teal-cyan — causing inconsistent rendering.
- **Invalid Tailwind classes:** Non-standard shades (`slate-330`, `slate-450`, `slate-650`, `slate-850`, etc.) that Tailwind cannot resolve.
- **No shared UI primitives:** Every page reimplements buttons, cards, alerts, inputs, tables, and loading spinners inline.
- **Incomplete light mode:** `ThemeContext` toggles a `dark` class but no light-theme styles exist.
- **Dead CSS:** `App.css` contains unused Vite boilerplate; `App.jsx` does not import it.
- **Inconsistent typography scale:** Mix of `text-[9px]`, `text-[10px]`, `text-xs`, `text-sm` with no documented hierarchy.
- **Mobile gaps:** Landing page nav has no hamburger menu; some admin tables overflow without polish.

**Goal:** Unify the design system, extract reusable components, fix invalid classes, polish every page visually, and add proper light/dark theming — without touching `backend/` or altering any API integration logic.

---

## 2. Backend Safety Boundaries

### Files that MUST NOT change (logic-wise)

| File | What stays the same |
|------|---------------------|
| `src/services/api.js` | Base URL, interceptors, token refresh logic, headers |
| `src/context/AuthContext.jsx` | All API calls, state shape, login/register/logout functions |
| All page files (logic) | `api.get/post/put` endpoints, request body field names, response field access |

### What CAN change in page files

- JSX structure and CSS class names
- Visual layout, spacing, typography, colors
- Loading/error/empty state **presentation** (not the conditions that trigger them)
- Icon choices and decorative elements
- Animation and transition classes

### What MUST NOT change in page files

- API endpoint paths (e.g. `/auth/login`, `/interviews/start`)
- Request payload keys (e.g. `experience_level`, `num_questions`, `custom_jd`)
- Response data access patterns (e.g. `res.data.interview.id`, `res.data.tokens`)
- Route paths in `react-router-dom` (e.g. `/interview/setup/:id`)
- Form field `name` attributes if used
- Navigation logic and conditional redirects
- Proctoring, MediaPipe, speech synthesis, and WebRTC logic in `InterviewSession.jsx` / `InterviewSetup.jsx`

### Environment

- `VITE_API_URL` in `.env` — do not modify
- `nginx.conf`, `Dockerfile` — out of UI scope unless deploying

---

## 3. Current State Audit

### File Inventory (41 files in `frontend/`)

```
frontend/
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
├── public/
│   ├── logo.jpg
│   └── icons.svg
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── App.css                    ← unused boilerplate
    ├── index.css                  ← global design tokens + utilities
    ├── context/
    │   ├── AuthContext.jsx
    │   └── ThemeContext.jsx
    ├── layouts/
    │   ├── DashboardLayout.jsx
    │   └── AdminLayout.jsx
    ├── pages/                     ← 20 page components
    └── services/
        └── api.js
```

### Page Route Map

| Route | Component | Layout |
|-------|-----------|--------|
| `/` | LandingPage | None |
| `/login` | LoginPage | None |
| `/register` | RegisterPage | None |
| `/forgot-password` | ForgotPasswordPage | None |
| `/dashboard` | Dashboard | DashboardLayout |
| `/interview/start` | InterviewConfig | DashboardLayout |
| `/interview/setup/:id` | InterviewSetup | DashboardLayout |
| `/interview/session/:id` | InterviewSession | DashboardLayout |
| `/interview/report/:id` | ReportDetailPage | DashboardLayout |
| `/coding` | CodingInterview | DashboardLayout |
| `/resume-match` | ResumeJdAnalyzer | DashboardLayout |
| `/history` | InterviewHistory | DashboardLayout |
| `/profile` | ProfilePage | DashboardLayout |
| `/admin` | AdminDashboard | AdminLayout |
| `/admin/users` | AdminUsersPage | AdminLayout |
| `/admin/interviews` | AdminInterviewsPage | AdminLayout |
| `/admin/transactions` | AdminTransactionsPage | AdminLayout |
| `/admin/feedback` | AdminFeedbackPage | AdminLayout |
| `/admin/logs` | AdminLogsPage | AdminLayout |

---

## 4. Design System Specification

### 4.1 Color Palette (Unified)

Replace the purple `tailwind.config.js` primary with teal-cyan to match `index.css`:

```
Primary (Teal-Cyan):
  50:  #ecfeff    500: #06b6d4    900: #164e63
  100: #cffafe    600: #0891b2
  200: #a5f3fc    700: #0e7490
  300: #67e8f9    800: #155e75
  400: #22d3ee

Accent (Indigo):   500: #6366f1   600: #4f46e5
Surface Dark:      bg: #030712   panel: rgba(9,17,34,0.45)
Surface Light:     bg: #f8fafc    panel: rgba(255,255,255,0.85)
Semantic:
  Success: emerald-400/500
  Warning: amber-400/500
  Error:   red-400/500
  Info:    blue-400/500
```

### 4.2 Typography

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `display` | 3rem–3.75rem | 800–900 | Hero headings |
| `h1` | 1.875rem–2.25rem | 700–800 | Page titles |
| `h2` | 1.5rem–1.875rem | 700 | Section headings |
| `h3` | 1.125rem–1.25rem | 600–700 | Card titles |
| `body` | 0.875rem–1rem | 400 | Paragraphs |
| `caption` | 0.75rem | 500 | Labels, metadata |
| `micro` | 0.625rem–0.6875rem | 600–700 | Badges, timestamps |

**Font stack:** `Inter, system-ui, -apple-system, sans-serif` (add via Google Fonts in `index.html`)

### 4.3 Spacing & Radius

- **Page padding:** `p-6 md:p-8 lg:p-10`
- **Card padding:** `p-5 md:p-6`
- **Section gap:** `space-y-6 md:space-y-8`
- **Border radius:** cards `rounded-2xl`, buttons `rounded-xl`, inputs `rounded-lg`, badges `rounded-full`

### 4.4 Elevation & Glass

```css
.glass-panel       → backdrop-blur-16, border white/6%, bg slate-950/45
.glass-panel-hover → hover border primary/40, shadow primary/10
.glass-input       → bg slate-950/60, focus ring primary/50
.glow-spot         → radial blur 120px, opacity 12%
```

Light mode variants added via `.dark` / `:root:not(.dark)` selectors.

### 4.5 Component Variants

| Component | Variants |
|-----------|----------|
| Button | `primary`, `secondary`, `ghost`, `danger`, `success` |
| Badge | `default`, `success`, `warning`, `error`, `rank-bronze/silver/gold/platinum` |
| Alert | `error`, `success`, `info`, `warning` |
| Card | `default`, `interactive`, `highlighted` |

### 4.6 Motion

- Page enter: `animate-fade-in` (opacity 0→1, 300ms)
- Card hover: `transition-all duration-300`
- Sidebar slide: `transition-transform duration-300`
- Spinner: unified `LoadingSpinner` component
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disable animations

---

## 5. Shared Component Library (New Files)

Create `src/components/ui/` to eliminate duplication:

| New File | Purpose | Used By |
|----------|---------|---------|
| `Button.jsx` | Primary/secondary/ghost/danger buttons with loading state | All pages |
| `Input.jsx` | Text input with optional left/right icon slot | Auth, Profile, Admin |
| `Textarea.jsx` | Styled textarea wrapper | Landing contact, Interview |
| `Select.jsx` | Styled native select | Register, Profile, Config |
| `Card.jsx` | Glass panel wrapper with optional header/footer | All dashboard pages |
| `Alert.jsx` | Error/success/info alert banners | All pages |
| `Badge.jsx` | Status and rank badges | Dashboard, Profile, Admin |
| `Spinner.jsx` | Unified loading spinner (sm/md/lg) | All pages |
| `PageHeader.jsx` | Title + subtitle + optional action slot | All inner pages |
| `EmptyState.jsx` | Icon + message + optional CTA | History, Dashboard, Admin |
| `StatCard.jsx` | KPI metric card with icon | Dashboard, AdminDashboard |
| `DataTable.jsx` | Responsive table wrapper with hover rows | Admin pages |
| `SearchBar.jsx` | Search input with icon | History, Admin pages |
| `Avatar.jsx` | Profile picture or initial fallback | Layouts, Profile |
| `ProgressRing.jsx` | SVG circular progress | Dashboard readiness index |
| `Modal.jsx` | Overlay modal (token override in AdminUsers) | AdminUsersPage |

Create `src/components/layout/`:

| New File | Purpose |
|----------|---------|
| `BrandLogo.jsx` | Reusable logo + "Interviewer.AI" text |
| `GlowBackground.jsx` | Configurable glow spot positions |
| `MobileNav.jsx` | Hamburger menu for LandingPage |

**Rule:** Components accept `className` prop for one-off overrides. No API logic inside components.

---

## 6. Global / Config Files

### 6.1 `index.html`

| Area | Current | Planned Change |
|------|---------|----------------|
| `<title>` | "Interviewer" | "Interviewer.AI — AI Mock Interview Platform" |
| Favicon | `/logo.jpg` | Keep; add `apple-touch-icon` |
| Fonts | None | Add `<link>` for Inter + Fira Code (code editor) |
| Meta | viewport only | Add `description`, `theme-color` (#030712) |
| `<body>` | Empty | Add `class="dark antialiased"` default |

**Backend impact:** None

---

### 6.2 `src/index.css`

| Section | Lines | Planned Change |
|---------|-------|----------------|
| `@import "tailwindcss"` | 1 | Keep |
| `@theme` color tokens | 3–21 | Add accent, surface, semantic tokens; sync with tailwind.config |
| `html, body` | 23–32 | Add light mode body bg (`#f8fafc`) via `:root:not(.dark)` |
| `.glass-panel` | 40–45 | Add light variant: white/85 bg, slate-200 border |
| `.glass-panel-hover` | 47–49 | Light hover: shadow-md, border-primary/30 |
| `.glass-input` | 51–55 | Light variant: white bg, slate-300 border |
| Icon padding rules | 57–67 | Keep; verify with new Input component |
| `.text-gradient` | 69–71 | Keep |
| `.glow-spot` | 74–83 | Light mode: reduce opacity to 6% |
| Scrollbar | 86–102 | Light mode track/thumb colors |
| `.code-editor` | 105–107 | Keep Fira Code |
| `.wave-bar` | 110–132 | Keep for voice recording UI |
| **NEW** | — | `@keyframes fade-in`, `.animate-fade-in` |
| **NEW** | — | `.btn-primary`, `.btn-secondary` utility classes |
| **NEW** | — | Print styles for ReportDetailPage |
| **NEW** | — | Light mode overrides block |

**Backend impact:** None

---

### 6.3 `tailwind.config.js`

| Area | Current | Planned Change |
|------|---------|----------------|
| `primary` colors | Purple (#8b5cf6) | Replace with teal-cyan matching index.css |
| `glass` colors | Defined | Keep, sync values |
| `animation` | pulse-slow only | Add fade-in, slide-up, slide-in-left |
| `fontFamily` | Not set | Add `sans: ['Inter', ...]`, `mono: ['Fira Code', ...]` |
| `darkMode` | `'class'` | Keep |

**Backend impact:** None

---

### 6.4 `src/main.jsx`

| Area | Current | Planned Change |
|------|---------|----------------|
| Imports | index.css, App | Keep |
| StrictMode | Enabled | Keep |

**Backend impact:** None

---

### 6.5 `src/App.jsx`

| Area | Lines | Planned Change |
|------|-------|----------------|
| Route definitions | 76–208 | **No path changes** |
| `ProtectedRoute` loading UI | 34–38 | Replace inline spinner with `<Spinner />`; add fade-in wrapper |
| `AdminRoute` loading UI | 52–57 | Same as above |
| Imports | 1–27 | Add Spinner import only |
| Catch-all redirect | 208 | Keep |

**Backend impact:** None — routing and guards unchanged

---

### 6.6 `src/App.css`

| Action | Detail |
|--------|--------|
| **Delete or gut** | Contains unused Vite template styles (.hero, .counter, #center). Not imported anywhere. Remove file entirely OR leave empty. |

**Backend impact:** None

---

### 6.7 `package.json`

| Action | Detail |
|--------|--------|
| No new dependencies required | lucide-react, recharts, tailwind already sufficient |
| Optional future | `@fontsource/inter` if avoiding CDN |

**Backend impact:** None

---

## 7. Context Files

### 7.1 `src/context/ThemeContext.jsx`

| Area | Current | Planned Change |
|------|---------|----------------|
| State | `'dark'` / `'light'` | Keep |
| DOM class toggle | Adds/removes `dark` on `<html>` | Keep; also toggle `data-theme` attribute for CSS hooks |
| Default | dark | Keep |
| **No new API calls** | — | — |

**Backend impact:** None

---

### 7.2 `src/context/AuthContext.jsx`

| Action | Detail |
|--------|--------|
| **Do not modify** | All authentication logic, API endpoints, and state management stay identical |

**Backend impact:** None (file untouched)

---

### 7.3 `src/services/api.js`

| Action | Detail |
|--------|--------|
| **Do not modify** | Axios instance, interceptors, base URL |

**Backend impact:** None (file untouched)

---

## 8. Layout Files

### 8.1 `src/layouts/DashboardLayout.jsx` (229 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Glow spots | 61–63 | Extract to `<GlowBackground />`; add light mode reduced opacity |
| Mobile overlay | 66–71 | Add backdrop-blur-md, fade-in animation |
| Sidebar container | 74 | Add subtle box-shadow on desktop; light mode white/90 bg |
| Brand header | 76–84 | Use `<BrandLogo />` component; improve logo rounded-xl ring |
| User card | 87–107 | Use `<Avatar />`; add online status dot; light mode bg |
| Nav menu items | 110–126 | Active state: left accent bar + bg gradient; hover scale icon; improve focus-visible ring for a11y |
| Nav icons | 121 | Consistent 18px → 20px with 2px stroke |
| Logout button | 129–137 | Use `<Button variant="ghost" />` with red hover |
| Top header bar | 143 | Sticky top-0 z-30; light mode border-slate-200 |
| Mobile menu btn | 145–150 | Larger touch target (44px min) |
| Token badge | 155–158 | Use `<Badge variant="warning" />`; add pulse when tokens = 0 |
| Theme toggle | 161–167 | Add tooltip aria-label; smooth icon rotation transition |
| Notifications bell | 170–218 | Dropdown: add slide-down animation; empty state illustration; mark-read visual feedback |
| Main content area | 223–225 | Add `animate-fade-in` on route change; max-w-7xl mx-auto optional |

**Logic preserved:** `menuItems`, `handleLogout`, `handleNotifClick`, `readAllNotifications`, route matching

**Backend impact:** None

---

### 8.2 `src/layouts/AdminLayout.jsx` (108 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Sidebar | 37 | Match DashboardLayout glass styling; add collapse on tablet |
| Logo block | 40–45 | Use `<BrandLogo variant="admin" />` |
| Nav section label | 49 | Improve uppercase tracking |
| NavLink items | 50–69 | Add left border accent on active; icon color transition |
| Return to Site link | 75–81 | Use `<Button variant="secondary" />` |
| Logout button | 83–89 | Match DashboardLayout logout styling |
| Main panel | 94–103 | Consistent padding with DashboardLayout; `<GlowBackground />` |
| **NEW** | — | Mobile: collapsible sidebar with hamburger (admin currently desktop-only) |

**Logic preserved:** `navItems`, `handleLogout`, NavLink `end` props

**Backend impact:** None

---

## 9. Public & Auth Pages

### 9.1 `src/pages/LandingPage.jsx` (632 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Background glows | 210–213 | `<GlowBackground variant="landing" />` with 3 spots |
| Navbar | 216–236 | **Add mobile hamburger** via `<MobileNav />`; sticky top-0 with glass blur on scroll; nav links underline animation |
| Hero left column | 240–267 | Increase heading scale; add subtle typewriter or fade-in stagger; CTA buttons use `<Button />` |
| Hero simulator widget | 270–418 | Refine step indicators (progress dots); improve scorecard grid spacing; fix invalid `slate-350/450/455` classes |
| Features grid | 422–442 | Cards: add top gradient border; icon containers uniform 48px; stagger reveal on scroll (CSS only) |
| Technology section | 445–495 | Replace static orb with animated diagram; fix `slate-250/450` classes |
| Pricing section | 498–537 | Popular plan: elevated shadow + scale; price typography hierarchy; fix `slate-455` |
| FAQ accordion | 540–560 | Smooth height transition; active question highlight border-left primary |
| Contact form | 563–615 | Use `<Input />`, `<Textarea />`, `<Button />`; success state with checkmark animation |
| Footer | 618–627 | Multi-column layout (brand, links, social); fix `slate-450` |

**Logic preserved:** Simulator state machine (simStep 0–4), speech synthesis, contact form (client-only, no API), scrollToSection, pricing/faq/features data arrays

**Backend impact:** None — contact form is local-only mock

---

### 9.2 `src/pages/LoginPage.jsx` (149 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Page wrapper | 46–49 | `<GlowBackground />` + centered flex |
| Brand logo | 52–55 | `<BrandLogo size="lg" />` |
| Login card | 58–60 | `<Card>` with max-w-md; subtle top gradient line |
| Error alert | 62–67 | `<Alert variant="error" />` |
| Email field | 71–84 | `<Input icon={Mail} label="Email Address" />` |
| Password field | 87–112 | `<Input icon={Lock} type="password" showToggle />` |
| Remember me | 115–126 | Custom styled checkbox with primary accent |
| Submit button | 129–135 | `<Button variant="primary" loading={loading} fullWidth />` |
| Register link | 138–143 | Improved link styling |

**Logic preserved:** `handleSubmit`, `login()`, `rememberMe` localStorage, navigate to `/dashboard`

**Backend impact:** None — same `login(email, password)` call

---

### 9.3 `src/pages/RegisterPage.jsx` (239 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Page wrapper | 69–72 | Match LoginPage layout |
| Signup card | 81–83 | `<Card maxWidth="lg">` ; step indicator optional |
| Form grid | 93–215 | All fields → `<Input />`, `<Select />`; consistent 2-col grid |
| Experience select | 181–192 | `<Select />` with styled options |
| Job role datalist | 196–214 | `<Input list="roles-list" icon={Briefcase} />` |
| Submit | 218–225 | `<Button loading={loading} icon={ChevronRight} />` |
| Token promo text | 83 | Highlight "5 free tokens" with badge |

**Logic preserved:** Validations, `register()` call with same 6 params, navigate to `/dashboard`

**Backend impact:** None

---

### 9.4 `src/pages/ForgotPasswordPage.jsx` (188 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Card | 77–81 | `<Card>` with step indicator (Step 1 of 2 / Step 2 of 2) |
| Step 1 form | 99–122 | `<Input icon={Mail} />`, `<Button />` |
| Debug OTP box | 127–132 | Styled as dev-only callout with monospace font, amber border |
| Step 2 form | 125–174 | OTP input: large digit boxes (visual only, same single input); `<Input icon={ShieldCheck} />` |
| Success/error | 83–95, 90–95 | `<Alert />` components |
| Back to login | 177–182 | Link styling |

**Logic preserved:** `handleRequestOtp` → POST `/auth/forgot-password`, `handleResetPassword` → POST `/auth/reset-password`, step state, debugOtp display

**Backend impact:** None

---

## 10. Candidate Dashboard Pages

### 10.1 `src/pages/Dashboard.jsx` (497 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Welcome banner | 168–198 | `<Card variant="highlighted">`; rank badge via `<Badge />`; CTA `<Button icon={Play} />` |
| Stat cards (×3) | 201–265 | Extract to `<StatCard />`; Readiness ring → `<ProgressRing value={averageScore} />` |
| Performance chart | 271–299 | Chart tooltip restyle; empty state → `<EmptyState />`; gradient stroke refinement |
| AI Career Coach | 302–377 | Terminal aesthetic: dark inset panel, monospace input, typing indicator animation |
| Recent mocks list | 383–435 | Row cards with hover lift; score color coding kept; skeleton loading state |
| Profile completeness | 438–489 | Progress bar with segment markers; checklist icons via `<Badge variant="success" />` |

**Logic preserved:** `loadDashboardData` → GET `/interviews/history`, rank calculation, coach simulated responses, chart data mapping

**Backend impact:** None

---

### 10.2 `src/pages/ProfilePage.jsx` (468 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Page header | 199–207 | `<PageHeader icon={User} title="..." subtitle="..." />` |
| Alerts | 209–221 | `<Alert />` |
| Profile form | 227–326 | Avatar via `<Avatar editable />`; form fields → `<Input />`, `<Select />`; Save → `<Button />` |
| Achievements grid | 329–354 | Locked badges: grayscale + lock icon overlay; unlocked: glow border |
| Rank card | 361–389 | `<Card>` with gradient background based on rank tier |
| Token purchase tiers | 392–422 | Pricing cards with hover scale; popular tier highlight |
| Transaction log | 425–459 | Timeline-style list with +/- color coding |

**Logic preserved:** All API calls (`/users/profile`, `/users/achievements`, `/tokens/transactions`, `/tokens/purchase`, `/users/profile/picture`), FormData upload, rank logic

**Backend impact:** None

---

### 10.3 `src/pages/InterviewHistory.jsx` (~189 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Page header | 57–65 | `<PageHeader icon={History} />` |
| Toolbar | 75–100 | `<SearchBar />` + styled filter/sort `<Select />` pills |
| History table/list | 100+ | Responsive: table on desktop, card list on mobile; score badges; status chips |
| Empty state | — | `<EmptyState message="No interviews yet" action="/interview/start" />` |
| Loading | — | Skeleton rows |

**Logic preserved:** GET `/interviews/history`, filter/sort logic, Link to report/setup

**Backend impact:** None

---

### 10.4 `src/pages/CodingInterview.jsx` (~253 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header | 85–95 | `<PageHeader icon={Code} />` |
| Challenge selector | — | Tab-style challenge picker with active underline |
| Language selector | — | Pill toggle buttons (Python, JS, Java, C++) |
| Code editor textarea | — | Dark IDE theme: line numbers (CSS), syntax-colored placeholder, `.code-editor` class |
| Run button | — | `<Button icon={Play} variant="primary" />` |
| Output panel | — | Terminal-style: green text on black, monospace |
| AI review panel | — | `<Card>` with score breakdown bars |

**Logic preserved:** POST `/interviews/evaluate-code` with `{ code, language }`, challenge/language switching logic

**Backend impact:** None

---

### 10.5 `src/pages/ResumeJdAnalyzer.jsx` (~319 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header | — | `<PageHeader icon={FileCheck} />` |
| Upload zone | — | Drag-and-drop styled area with dashed border, icon, file name display |
| Resume analysis results | — | Skill tags as `<Badge />` chips; experience/education cards |
| JD textarea | — | `<Textarea />` with character count |
| Match results | — | Circular match % ring; missing skills in red badges, matched in green |
| Practice gaps CTA | — | `<Button icon={ArrowRight} />` navigate to `/interview/start` |

**Logic preserved:** POST `/resume-jd/analyze-resume`, POST `/resume-jd/match`, navigate state passing

**Backend impact:** None

---

## 11. Interview Flow Pages

### 11.1 `src/pages/InterviewConfig.jsx` (~330 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Page header | — | `<PageHeader title="Configure Interview" />` |
| Interview type selector | — | Card grid (Technical, HR, Behavioral, Custom) with icons; selected state border-primary |
| Role selector | — | Pill buttons + custom text input reveal |
| Difficulty / questions | — | Slider or segmented control for numQuestions; difficulty as radio cards |
| JD upload | — | File drop zone; uploading spinner; extracted text preview in collapsible panel |
| Token warning | — | `<Alert variant="warning" />` when tokens < 1 |
| Start button | — | `<Button icon={Play} size="lg" />` |

**Logic preserved:** POST `/interviews/start` payload, POST `/resume_jd/extract-file-text`, token check, navigate to setup

**Backend impact:** None

---

### 11.2 `src/pages/InterviewSetup.jsx` (~328 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Interview metadata display | — | Summary card (role, type, difficulty, question count) |
| Camera preview | — | Rounded video container with ring border; permission denied state |
| Checklist items | — | Camera ✓, Mic ✓, Fullscreen ✓ with animated checkmarks |
| Verify hardware btn | — | `<Button icon={Camera} />` |
| Fullscreen btn | — | `<Button icon={Maximize} variant="secondary" />` |
| Start interview btn | — | Disabled until all checks pass; primary CTA |
| Warning callouts | — | Proctoring rules info card with `<ShieldAlert />` |

**Logic preserved:** GET `/interviews/:id/details`, getUserMedia, fullscreen API, POST `/interviews/:id/begin`, camera stream cleanup

**Backend impact:** None

---

### 11.3 `src/pages/InterviewSession.jsx` (~871 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Session header bar | — | Timer display, question counter, violation count badge |
| Proctoring sidebar | — | Camera feed thumbnail; gaze indicator; violation alert toast |
| Question panel | — | Large readable question text; TTS mute toggle |
| Voice recording UI | — | Waveform bars (`.wave-bar`); record button pulsing red; duration counter |
| Text input mode | — | Toggle tabs (Voice / Text); textarea with submit |
| Transcript review | — | Modal or inline panel before final submit |
| Navigation | — | Progress bar across top showing question N of M |
| Violation overlay | — | Full-width amber/red alert banner with `<ShieldAlert />` |

**Logic preserved (critical — do NOT touch):**
- MediaPipe proctoring initialization
- Tab visibility detection
- Audio recording + POST transcribe endpoint
- POST answer submission
- Violation counting + session termination
- Speech synthesis for questions
- All `api.post/get` calls and refs

**Backend impact:** None — only CSS/className and JSX wrapper changes

---

### 11.4 `src/pages/ReportDetailPage.jsx` (~487 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Back navigation | — | `<Button variant="ghost" icon={ChevronLeft} />` |
| Score hero | — | Large circular score with pass/fail badge |
| Metrics grid | — | Technical, Communication, Confidence cards with progress bars |
| Strengths/weaknesses | — | Two-column lists with thumbs up/down icons |
| Q&A review | — | Accordion per question with answer + score |
| Proctoring summary | — | Violation count, webcam snapshots grid if present |
| Feedback form | — | Star rating selector, textarea, submit button |
| Print button | — | `@media print` styles in index.css; hide sidebar/nav |

**Logic preserved:** GET `/interviews/:id/report`, POST `/feedback`, JSON parse for strengths/weaknesses

**Backend impact:** None

---

## 12. Admin Pages

### 12.1 `src/pages/AdminDashboard.jsx` (283 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Title block | 79–90 | `<PageHeader />` with system status `<Badge variant="success">Online</Badge>` |
| KPI grid (×4) | 108–157 | `<StatCard />` with color-coded icons |
| Ban audit panel | 160–212 | `<Card variant="highlighted">` red accent; table via `<DataTable />` |
| Feedback + Logs grid | 216–280 | Two-column cards with scrollable content; fix `slate-450/650` classes |

**Logic preserved:** GET `/admin/stats`, GET `/admin/users`, POST `/admin/users/:id/ban`

**Backend impact:** None

---

### 12.2 `src/pages/AdminUsersPage.jsx` (~259 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header + search | — | `<PageHeader />` + `<SearchBar />` |
| Users table | — | `<DataTable />` with columns: Name, Email, Role, Status, Tokens, Actions |
| Status badges | — | Active=green, Banned=red via `<Badge />` |
| Ban/Unban buttons | — | `<Button variant="danger/success" size="sm" />` |
| Token override modal | — | `<Modal />` with number input + confirm |

**Logic preserved:** GET `/admin/users`, POST ban, POST tokens override

**Backend impact:** None

---

### 12.3 `src/pages/AdminInterviewsPage.jsx` (~178 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header + search | — | `<PageHeader />` + `<SearchBar />` |
| Interviews table | — | Columns: Candidate, Role, Type, Score, Status, Proctoring, Date, Link |
| Proctoring flags | — | `<Badge variant="warning" />` for violations |
| View report link | — | Icon button with tooltip |

**Logic preserved:** GET `/admin/interviews`, filter logic

**Backend impact:** None

---

### 12.4 `src/pages/AdminTransactionsPage.jsx` (~162 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header + search | — | Standard admin page pattern |
| Transactions table | — | Type icon (purchase=green, deduction=red, gift=blue); amount formatting |
| Summary row | — | Optional top stats: total revenue, tokens issued |

**Logic preserved:** GET `/admin/transactions`, filter logic

**Backend impact:** None

---

### 12.5 `src/pages/AdminFeedbackPage.jsx` (~151 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header + search | — | Standard admin page pattern |
| Feedback cards | — | Card feed layout with star rating visual, issue flag highlight |
| Issue reported | — | Red callout box when present |

**Logic preserved:** GET `/admin/feedback`, filter logic

**Backend impact:** None

---

### 12.6 `src/pages/AdminLogsPage.jsx` (~134 lines)

| Section | Lines | Planned UI Changes |
|---------|-------|-------------------|
| Header + search | — | Standard admin page pattern |
| Logs table | — | Monospace font; action type color-coded; timestamp formatted |
| Action badges | — | Color by action category (ban=red, token=amber, login=blue) |

**Logic preserved:** GET `/admin/logs`, filter logic

**Backend impact:** None

---

## 13. Implementation Phases & Order

Execute in this order to avoid rework:

### Phase 1 — Foundation (Day 1)
1. `index.css` — unified tokens, light mode, animations, fix utilities
2. `tailwind.config.js` — sync primary palette, fonts, animations
3. `index.html` — fonts, meta, title
4. Delete/gut `App.css`
5. Create all `src/components/ui/*` primitives
6. Create `src/components/layout/*` helpers

### Phase 2 — Shell (Day 2)
7. `DashboardLayout.jsx`
8. `AdminLayout.jsx`
9. `App.jsx` — loading states only

### Phase 3 — Public Pages (Day 2–3)
10. `LandingPage.jsx`
11. `LoginPage.jsx`
12. `RegisterPage.jsx`
13. `ForgotPasswordPage.jsx`

### Phase 4 — Dashboard Pages (Day 3–4)
14. `Dashboard.jsx`
15. `ProfilePage.jsx`
16. `InterviewHistory.jsx`
17. `CodingInterview.jsx`
18. `ResumeJdAnalyzer.jsx`

### Phase 5 — Interview Flow (Day 4–5)
19. `InterviewConfig.jsx`
20. `InterviewSetup.jsx`
21. `InterviewSession.jsx` *(UI only — extreme care)*
22. `ReportDetailPage.jsx`

### Phase 6 — Admin (Day 5–6)
23. `AdminDashboard.jsx`
24. `AdminUsersPage.jsx`
25. `AdminInterviewsPage.jsx`
26. `AdminTransactionsPage.jsx`
27. `AdminFeedbackPage.jsx`
28. `AdminLogsPage.jsx`

### Phase 7 — QA & Polish (Day 6)
29. Cross-browser check (Chrome, Firefox, Edge)
30. Mobile responsive pass (320px–768px–1280px)
31. Light/dark mode toggle verification
32. Lint (`npm run lint`)
33. Build (`npm run build`)
34. Manual smoke test against running backend

---

## 14. Testing Checklist

### Visual Regression
- [ ] All 20 routes render without layout breaks
- [ ] No invalid Tailwind classes remain (grep for `slate-[0-9]{3}` non-standard)
- [ ] Light mode readable on all pages
- [ ] Dark mode consistent across all pages

### Functional (Backend Integration)
- [ ] Login / Register / Logout work
- [ ] Forgot password OTP flow works
- [ ] Dashboard loads interview history
- [ ] Start interview → setup → session → report full flow
- [ ] Voice recording and proctoring still function
- [ ] Code evaluation returns output
- [ ] Resume upload and JD match work
- [ ] Profile update and avatar upload work
- [ ] Token purchase updates balance
- [ ] Admin stats, ban/unban, token override work
- [ ] All admin tables load and search filters work
- [ ] Feedback submission on report page works

### Accessibility
- [ ] Focus visible on all interactive elements
- [ ] Color contrast WCAG AA on text
- [ ] Buttons min 44×44px touch target on mobile
- [ ] Form labels associated with inputs

### Performance
- [ ] No new npm dependencies causing bundle bloat
- [ ] Build completes without errors
- [ ] Lighthouse performance score not degraded >10%

---

## Appendix A — Invalid Classes to Replace

| Invalid Class | Replace With |
|---------------|-------------|
| `text-slate-330` | `text-slate-300` |
| `text-slate-350` | `text-slate-300` |
| `text-slate-450` | `text-slate-400` |
| `text-slate-455` | `text-slate-400` |
| `text-slate-550` | `text-slate-500` |
| `text-slate-650` | `text-slate-600` |
| `text-slate-850` | `text-slate-800` |
| `border-slate-850` | `border-slate-800` |
| `bg-slate-850` | `bg-slate-800` |
| `hover:bg-slate-850` | `hover:bg-slate-800` |
| `border-orange-850/20` | `border-orange-800/20` |
| `from-slate-450` | `from-slate-400` |
| `to-slate-850` | `to-slate-800` |

---

## Appendix B — Files Explicitly Excluded from Changes

| File | Reason |
|------|--------|
| `backend/**` | User constraint |
| `src/services/api.js` | API contract stability |
| `src/context/AuthContext.jsx` | Auth logic stability |
| `nginx.conf` | Deployment config |
| `Dockerfile` | Deployment config |
| `vite.config.js` | No changes needed |
| `postcss.config.js` | No changes needed |
| `.gitignore` | No changes needed |
| `README.md` | Out of scope unless requested |

---

*Document version: 1.0*  
*Created: July 7, 2026*  
*Project: Interviewer.AI — Bootcamp Project 01*
