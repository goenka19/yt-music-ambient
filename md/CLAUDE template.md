# Project Guidelines

## Design Standards

### Visual Style - NO VIBE CODE AESTHETICS
- **NO** purple or violet text/accents
- **NO** gradients (especially purple-blue or pink-purple)
- **NO** dark blue/purple backgrounds
- **NO** glassmorphism or frosted glass effects
- **NO** neon glows or shadows
- **NO** excessive rounded corners or animations
- **NO** "hero" sections with giant text and stock illustrations
- **NO** emojis in UI unless explicitly requested

### Use Instead
- Clean white or light gray backgrounds (`bg-white`, `bg-slate-50`)
- Black or dark slate text (`text-slate-800`, `text-slate-900`)
- One accent color max, muted (`emerald-600`, `blue-600` - not neon)
- Subtle borders (`border-slate-200`)
- Sharp, functional design like Stripe, Linear, or Vercel docs

### Typography & Readability
- Body text: `text-sm` or `text-base`, `text-slate-700` or darker
- Headings: `font-semibold` or `font-bold`, `text-slate-800`
- Never light gray text on white (`text-slate-400` on `bg-white` = unreadable)
- Minimum contrast ratio: 4.5:1 for body text
- Dashboard compact cards: `text-xs` acceptable
- Learning/reading pages: minimum `text-sm` for body text

### Forms & Inputs
- White background (`bg-white`), visible borders (`border border-slate-300`)
- Dark text (`text-slate-900`)
- Clear focus states (`focus:ring-2 focus:ring-blue-500`)
- Validate on blur or submit, never while typing

### Buttons
- Primary: `bg-slate-800 text-white`
- Secondary: `border border-slate-300 text-slate-700`
- No gradient buttons

### Cards & Containers
- Standard card style: `bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-100`
- Or simple: `bg-white border border-slate-200 rounded-lg`

### Design Process
1. **Read before creating** - Read 2-3 existing components first. Copy patterns exactly.
2. **No new UI patterns** - Don't introduce accordions, modals, etc. unless they exist. Ask first.
3. **When uncertain, ask** - One question saves a rewrite.

---

## Claude Brief Rules

The Claude-generated market brief must use plain language. Banned terms:
- goldilocks, hawkish, dovish, risk-on, risk-off
- capitulation, consolidation, soft landing, hard landing
- bulls, bears, headwinds, tailwinds
- rally (say "rose"), correction (say "fell")
- volatility (say "prices moving quickly")

Write for someone who reads news but has never worked in finance.

---

## Code Quality Standards

### Before Writing Code
- Read existing code before modifying - understand patterns in use
- Check if similar functionality exists before creating new
- Identify all files that will be affected

### While Writing Code
- No unused variables, imports, or functions - delete immediately
- No commented-out code - git has history
- Consistent naming: camelCase for JS/TS, snake_case for Python
- Types for all function parameters and return values
- Handle null/undefined explicitly

### Data & Timezone Handling
- Always use explicit timezones - never rely on system defaults
- Store dates as ISO strings with timezone (e.g., `2026-02-24T00:00:00+05:30`)
- For Indian markets: IST (Asia/Kolkata), market close is 15:30 IST
- Handle weekends/holidays explicitly for market data

### API & Data Fetching
- Validate external API responses before using
- Clear cache after any data mutation
- Document data sources and their quirks

---

## API Security

### Authentication Rules
- **ALL POST/PUT/DELETE endpoints MUST require authentication** (API key or user auth)
- Only GET endpoints for public data can be unauthenticated
- Use the `verify_api_key()` helper function for API key checks
- Never create "convenience" endpoints without auth - if it modifies data, it needs auth

### API Key Handling
- Store secrets in environment variables (`DATA_PUSH_SECRET`)
- **Always use constant-time comparison** (`secrets.compare_digest()`) - never `==` or `!=`
- Never log or return API keys in responses
- Never expose API keys to the frontend

### CORS Configuration
- **Never use `allow_origins=["*"]`** in production
- Explicitly list allowed domains:
  ```python
  ALLOWED_ORIGINS = [
      "https://macro-dashboard-production.up.railway.app",
      "http://localhost:5173",  # Dev only
  ]
  ```
- Set `allow_credentials=False` unless specifically needed
- Only allow required methods: `["GET", "POST"]`

### Frontend Security
- Frontend should NEVER call endpoints that modify data directly
- Admin/mutation endpoints should only be called by:
  - Scheduled jobs (backend scheduler)
  - GitHub Actions with secrets
  - Manual curl with API key
- The refresh button should only re-fetch cached data, not trigger expensive operations

### Before Adding New Endpoints
1. Does it modify data? → Require API key
2. Does it cost money (LLM calls, external APIs)? → Require API key
3. Could it be abused (rate limiting, DoS)? → Require API key
4. Is it read-only public data? → OK to be unauthenticated

### Security Checklist for New Endpoints
- [ ] POST/PUT/DELETE has `x_api_key: str = Header(None)` parameter
- [ ] Calls `verify_api_key(x_api_key)` at start of function
- [ ] No secrets in response body
- [ ] Added to CORS `allow_methods` if new method type

---

## Testing & Pre-Deploy

### Before Every Commit
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

### Pre-Deploy Checklist
- [ ] All automated checks pass (typecheck, lint, test, build)
- [ ] No console.log statements
- [ ] Test the actual UI flow manually
- [ ] Check mobile responsiveness
- [ ] Verify data displays correctly
- [ ] Test edge cases: no data, stale data, error states
- [ ] **Security: All new POST endpoints require API key auth**
- [ ] **Security: No `allow_origins=["*"]` in CORS config**

### After Deploy
- [ ] Verify production site loads
- [ ] Check browser console for errors
- [ ] Test one critical user flow

---

## Common Bugs to Avoid

### Frontend
- Text contrast issues (dark on dark, light on light)
- Form validation errors showing before user finishes typing
- Loading states that flash or show stale data
- Date/timezone mismatches (JS Date uses local timezone)
- Conditional rendering hiding content incorrectly

### Backend
- Cache not invalidating after data changes
- Missing weekend/holiday checks for market data
- Assuming API responses have all fields
- **Unprotected POST endpoints** - always require API key for data mutations
- **Using `==` for API key comparison** - use `secrets.compare_digest()` instead
- **CORS `allow_origins=["*"]`** - always restrict to specific domains

### Data
- Wrong data source (verify data matches expectations)
- Not handling null/missing values
- Percentage vs absolute value confusion

---

## Project Structure

- Frontend: `/frontend` - React + TypeScript + Vite + Tailwind
- Backend: `/backend` - FastAPI + SQLAlchemy + SQLite
- API hooks: `/frontend/src/hooks/useApi.ts`
- Components: `/frontend/src/components/`
- Pages: `/frontend/src/pages/`

---

## Git Workflow

### Commit Messages
- Format: `type: description` (e.g., `fix: email input visibility`)
- Types: feat, fix, refactor, test, docs, chore

### Rules
- **Don't push** unless explicitly asked - Railway auto-deploys from main
- **Fix TypeScript errors** immediately - don't leave them
- Never push failing tests or untested UI changes

---

## AI Assistant Instructions

When working with this codebase:
- Run typecheck after any TypeScript changes
- Build and visually verify UI changes
- Don't commit without running all checks
- If a bug is found, write a test for it before fixing
- Delete unused code, don't comment it out
- Follow design standards - no gradient/purple/dark-blue nonsense
- Verify text contrast and input visibility on every UI change

### ALWAYS Test Frontend Changes Before Saying "Fixed"

**NEVER claim a frontend fix is working without actually testing it.**

Before saying a UI fix is complete:
1. Run `npm run build` to verify it compiles
2. Run `npm run dev` and visually check the change in a browser
3. Test BOTH light mode AND dark mode
4. Check browser console for errors/warnings
5. Only then say "fixed" or push to production

**Bad**: "Fixed the email input styling" (without testing)
**Good**: "Fixed the email input - verified in both light/dark mode, build passes"

If you cannot visually test (no browser access), say so explicitly:
- "I've made the change but cannot visually verify - please test before deploying"

### Stop and Ask When Things Get Complicated

**If a simple task becomes complicated, STOP and ask the user.**

Examples of when to stop:
- Task requires fetching new data when existing data should work
- Multiple workarounds needed for what should be straightforward
- Environment issues blocking basic operations
- More than 2-3 steps for something that sounds simple

What to do instead:
1. State what the simple solution should be
2. Explain what's blocking it
3. Ask if there's an easier path or if the user wants to proceed with the complex route

**Bad**: Silently going down a rabbit hole of data fetching, environment flags, and workarounds
**Good**: "The Feb 24 brief already exists with news sources. Do you want to see that, or regenerate it fresh?"

Don't overcomplicate. Ask first.

### Debugging React Re-renders - Trace the Full Data Flow

**NEVER push fixes to production without testing locally first.**

When components re-render unexpectedly, trace the FULL data flow before attempting fixes:

1. **Check loading states FIRST** - A common mistake is passing a combined loading state like `loading={dataLoading || chartLoading}` that causes the entire component to show a skeleton, unmounting all children. This looks like "refreshing" but is actually complete unmount/remount.

2. **Trace from state change to render:**
   - What state changed? (e.g., `days` changed from 7 to 30)
   - What hooks depend on that state? (e.g., `useHistoricalMetrics(days)`)
   - What props change as a result? (e.g., `loading` becomes true)
   - Does that prop cause conditional rendering? (e.g., `if (loading) return <Skeleton/>`)

3. **React.memo doesn't help if the parent unmounts the child** - Memoization only prevents re-renders when props are equal. If the parent conditionally renders based on loading state, the child unmounts entirely.

4. **Don't make arbitrary decisions** - If UI has 7D/30D/90D options, don't create a separate 14D data source. Match what exists.

5. **Separate loading states by concern:**
   - Full skeleton: only when critical data isn't available
   - Chart loading: only affects the chart area, not cards
   - Card loading: only affects individual cards

**Example of the bug that was fixed:**
```jsx
// BAD: Chart loading causes entire component to show skeleton
loading={displayLoading || histLoading}

// GOOD: Separate loading states
loading={displayLoading}      // Full skeleton only for metrics
chartLoading={histLoading}    // Only chart area shows loading
```

The cards kept "refreshing" because `histLoading` triggered the full skeleton, unmounting all cards. React.memo was irrelevant - the cards weren't re-rendering, they were being destroyed and recreated.
