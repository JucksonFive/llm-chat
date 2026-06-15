# Frontend Expert Skill

Use this skill for expert-level React, Next.js, TypeScript, and frontend architecture work.

## Scope
This skill applies when building or refactoring UI components, designing component hierarchies, debugging rendering issues, optimizing performance, improving accessibility, setting up state management, structuring data-fetching flows, reviewing frontend code, and choosing rendering strategies.

## Capabilities

### 1. React and Next.js Development
- Build reusable, composable UI components with clear interfaces
- Create pages, layouts, forms, modals, dashboards, and navigation systems
- Use App Router, Server Components, Client Components, and API routes appropriately
- Structure projects for maintainability and scalability (feature-based, domain-driven, or hybrid)
- Leverage React 19 features: Server Components, Actions, use() hook, ref as a prop, form actions, useOptimistic, and useFormStatus

### 2. Frontend Architecture
- Recommend clean component structure with clear separation of concerns
- Separate presentation, business logic, state management, and data-fetching layers
- Design folder structures that scale with team and feature growth
- Choose suitable rendering strategy: SSR, SSG, ISR, CSR, PPR, or hybrid
- Favor composition, immutability, and declarative patterns

### 3. Performance Optimization
- Reduce unnecessary re-renders with React.memo, useMemo, useCallback, and structural fixes
- Lower bundle size with code splitting, dynamic imports, and dead code elimination
- Optimize images, fonts, and third-party scripts
- Diagnose rendering bottlenecks with React DevTools Profiler and browser tooling
- Address hydration mismatches, CLS, and LCP bottlenecks
- Apply streaming and Suspense boundaries where useful

### 4. Accessibility and UX
- Start with semantic HTML before ARIA
- Ensure keyboard navigation, focus management, and visible focus indicators
- Maintain WCAG AA contrast and support prefers-reduced-motion
- Improve UX with loading, empty, error, and optimistic states
- Validate with jsx-a11y baseline linting

### 5. State Management and Data Flow
- Design data flows that minimize waterfalls
- Choose the right tool for state scope: local state, Context/Zustand, or server-cache tools like TanStack Query
- Avoid stale state, race conditions, and unnecessary global state
- Apply optimistic updates with rollback when needed

### 6. Debugging and Code Review
- Trace data flow and rendering behavior to identify frontend defects
- Explain root cause before proposing fixes
- Provide corrected code with clear rationale
- Suggest cleaner and safer alternatives with concrete benefits

## Practical Examples
- User wants architecture for a real-time dashboard: provide a component/data-flow plan optimized for render isolation and cache boundaries
- User asks for a frontend code review: focus on maintainability, performance, and accessibility findings
- User reports sluggish UI: profile probable hot paths and propose concrete remediation
