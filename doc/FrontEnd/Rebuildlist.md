# Frontend Refactoring To-Do List

This list tracks the refactoring tasks based on the code quality assessment. Each task will be tested to ensure functionality remains intact.

## Phase 1: Code Consolidation and Cleanup

-   [ ] **Task 1.1:** Consolidate Styling.
    -   [ ] Move inline styles from `DataViewer.tsx` to a dedicated CSS file.
    -   [ ] Move the `<style>` block from `LoopBoundary.tsx` to a CSS file.
    -   [ ] Move the `<style>` block from `loop-end.node.tsx` and `loop-start.node.tsx` to a CSS file.
    -   [ ] Review `glass-ui.css` and `globals.css` for potential consolidation.
-   [x] **Task 1.2:** Create a shared `ParameterInput` component.
    -   [x] Create `src/components/ParameterInput.tsx`.
    -   [x] Move the `ParameterInput` implementation from one of the `src/nodes/*.node.tsx` files into the new shared component.
    -   [x] Refactor all `*.node.tsx` files to import and use the shared `ParameterInput` component.
-   [x] **Task 1.3:** Remove Hardcoded API URLs.
    -   [x] Replace hardcoded `http://localhost:3001` URLs in `App.tsx` and `state-linkage.manager.ts` with relative paths (e.g., `/api/...`) to utilize the Vite proxy.

## Phase 2: State Management and Logic Refactoring

-   [x] **Task 2.1:** Refactor State Management.
    -   [x] Move `nodes`, `connections`, and `selectedNode` state from `App.tsx` into a new Zustand store (`useCanvasStore`).
    -   [x] Refactor `App.tsx`, `Sidebar.tsx`, `PropertyPanel.tsx`, and other affected components to use the new store instead of props.
-   [ ] **Task 2.2:** Decouple `App.tsx` with Custom Hooks.
    -   [ ] Create `src/hooks/useCanvasInteraction.ts` to manage node/connection creation, deletion, and selection logic.
    -   [ ] Create `src/hooks/useWorkflowExecution.ts` to manage `runFlow` and `stopFlow` logic, moving the `fetch` call into `workflowService.ts`.
    -   [ ] Create `src/hooks/useCanvasLayout.ts` to manage the S-shaped layout calculation and canvas resizing logic.
    -   [ ] Refactor `App.tsx` to use these new hooks, significantly reducing its complexity.

## Phase 3: Testing and Verification

-   [x] **Task 3.1:** Write Unit/Integration Tests.
    -   [x] Set up a testing environment (Vitest and React Testing Library are already in `devDependencies`).
    -   [x] Write a test for the shared `ParameterInput` component (`test/frontend/components/ParameterInput.test.tsx`).
    -   [x] Write a test for the new Zustand store to verify state updates (`test/frontend/stores/useCanvasStore.test.tsx`).
-   [x] **Task 3.2:** End-to-End (E2E) Verification.
    -   [x] Manually run the application and test all core functionalities.
    -   [x] Confirm there are no console errors.
    -   [x] Verify that communication with the backend is working correctly.
