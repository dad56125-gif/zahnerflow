# Frontend Code Quality Assessment Report

**Project:** ZAHNERFLOW Frontend
**Date:** 2025年10月8日
**Auditor:** Gemini

#### 1. Overall Architecture

The frontend is a modern single-page application (SPA) built with **React** and **TypeScript**. It uses **Vite** for building and development, which provides a fast development experience.

-   **UI:** The UI is component-based, with a clear separation of components located in `src/components`. The application employs a "glassmorphism" UI style, with dedicated CSS in `src/styles/glass-ui.css`.
-   **State Management:** Global state is managed by **Zustand** (`src/stores/index.ts`), which is a lightweight and effective solution. However, the main `App.tsx` component still manages a significant amount of local state, indicating an opportunity for further centralization.
-   **Data & Business Logic:** Logic is well-separated into `services` and `managers`.
    -   `src/services`: Contains modules for making API calls (using `axios`), managing WebSocket connections (`socket.io-client`), and handling specific business logic like the loop context.
    -   `src/managers`: The `state-linkage.manager.ts` acts as a crucial bridge, synchronizing frontend state with the backend via WebSockets and API calls.
-   **Modularity:** The concept of "nodes" is highly modular, with each node's definition, configuration, and UI component clearly defined in the `src/nodes` directory. This is a strong architectural pattern that allows for easy extension.

#### 2. Code Quality Assessment

The overall code quality is high, demonstrating good practices in modern web development.

##### Strengths:

1.  **Modern Technology Stack:** The use of React, TypeScript, Vite, and Zustand is a robust and maintainable choice.
2.  **Strong Typing:** The project enforces `strict` mode in `tsconfig.json` and makes extensive use of TypeScript interfaces and types (e.g., `src/nodes/types.ts`), which reduces runtime errors and improves developer experience.
3.  **Component-Based Structure:** Components are well-defined and separated by function in the `src/components` directory, promoting reusability and separation of concerns.
4.  **Centralized API Services:** API communication is neatly abstracted into the `src/services` directory, preventing API logic from scattering across UI components.
5.  **Effective State Management:** The use of Zustand in `src/stores` for global state is a good practice, simplifying state sharing between distant components.
6.  **Modular Node System:** The structure in `src/nodes` is excellent, making it easy to add or modify node types without affecting the rest of the application.

##### Areas for Improvement (Redundancy and Coupling):

1.  **High Coupling in `App.tsx`:** The `App.tsx` component is a "God component" that handles too many responsibilities:
    -   Managing nodes, connections, and selections.
    -   Canvas layout calculations (S-shape logic).
    -   Drag-and-drop logic.
    -   Running and stopping workflows (including direct `fetch` calls).
    -   Initializing managers and effects.
    -   **Recommendation:** Refactor `App.tsx` by extracting logic into custom hooks (e.g., `useCanvasNodes`, `useWorkflowExecution`, `useCanvasLayout`). This will make the component significantly cleaner and easier to maintain.

2.  **Redundant Code in Node Components:** The `ParameterInput` component is re-implemented inside every file in `src/nodes/*.node.tsx`.
    -   **Recommendation:** Create a single, reusable `ParameterInput` component in `src/components/` and import it into each node component. This will eliminate significant code duplication.

3.  **Inconsistent Styling:** The project uses a mix of global CSS files (`globals.css`, `glass-ui.css`), inline styles (e.g., in `DataViewer.tsx`), and `<style>` blocks inside components (e.g., `LoopBoundary.tsx`).
    -   **Recommendation:** Adopt a consistent styling strategy. Either move all styles to CSS files (perhaps using CSS Modules to scope them) or use a CSS-in-JS library. Avoid inline styles for complex styling and remove `<style>` blocks from components.

4.  **State Management Opportunities:** While Zustand is used, `App.tsx` still manages critical state like `selectedNode`, `nodes`, and `connections` via `useState`. This leads to prop drilling (passing state down through multiple layers of components).
    -   **Recommendation:** Move more of the global application state (like `nodes`, `connections`, `selectedNode`, `isRunning`) into the Zustand stores. This will decouple components and simplify state access.

5.  **Hardcoded Configuration:** API endpoints like `http://localhost:3001` are hardcoded in `App.tsx` and `state-linkage.manager.ts`.
    -   **Recommendation:** Use relative URLs (e.g., `/api/workflows`) to leverage the Vite proxy already configured in `vite.config.ts`. For other constants, use a dedicated configuration file or environment variables.

#### 3. File Purpose Analysis

Here is a breakdown of the purpose of each file in the `apps/frontend/src` directory:

-   **`App.tsx`**: The main application component. It orchestrates all major UI components (Toolbar, Sidebar, Canvas, etc.) and manages the core application logic for the workflow editor.
-   **`main.tsx`**: The entry point of the React application. It renders the `App` component into the DOM.
-   **`components/DataViewer.tsx`**: A component to display raw data, processed results, and a simple chart for a selected workflow node.
-   **`components/DevicePanel.tsx`**: A UI panel for managing and viewing the status of connected hardware devices (e.g., potentiostats).
-   **`components/LoopBoundary.tsx`**: A visual component that draws a boundary around nodes that are part of a loop on the canvas.
-   **`components/NotificationPanel.tsx`**: A panel that displays real-time notifications received from the backend via WebSockets.
-   **`components/PropertyPanel.tsx`**: A panel that displays and allows editing of the properties and parameters of the currently selected node.
-   **`components/Sidebar.tsx`**: The left-hand sidebar that contains the library of available nodes, allowing users to drag or click to add them to the canvas.
-   **`components/StatusBar.tsx`**: The bottom status bar of the application, displaying information like node count, zoom level, and execution status.
-   **`components/Toolbar.tsx`**: The floating toolbar at the top of the canvas, providing main actions like New, Open, Save, Run, and Stop.
-   **`components/TopNavbar.tsx`**: The main navigation bar at the top of the application, which includes the application logo and the crucial workstation selector.
-   **`managers/state-linkage.manager.ts`**: A critical singleton class that manages the state synchronization between the frontend and backend, handling workflow execution commands and listening to real-time updates via WebSockets.
-   **`nodes/*.node.tsx`**: Each file in this directory is a React component that defines the UI and parameter inputs for a specific type of workflow node (e.g., `EISPotentiostaticNode`).
-   **`nodes/index.ts`**: An index file that exports and registers all the node components, making them available to the application.
-   **`nodes/types.ts`**: A central file defining all the TypeScript types and interfaces for the workflow nodes, their data structures, configurations, and categories. This is a core part of the application's data model.
-   **`services/api.ts`**: A service that configures and exports a shared `axios` instance for making HTTP requests to the backend API. It includes interceptors for handling auth and errors.
-   **`services/deviceService.ts`**: A service that encapsulates all API calls related to managing hardware devices.
-   **`services/LoopContextManager.ts`**: A singleton class to manage the logic, context, and nesting of loops within a workflow.
-   **`services/websocket.service.ts`**: A service that manages the `socket.io-client` connection, including connection logic, event handling, and providing a single interface for WebSocket communication.
-   **`services/workflowService.ts`**: A service that encapsulates all API calls related to creating, reading, updating, and executing workflows.
-   **`stores/index.ts`**: This file defines the global application state using Zustand stores. It separates state into logical slices: `useWorkflowStore`, `useExecutionStore`, `useDeviceStore`, and `useAppStore`.
-   **`styles/glass-ui.css`**: A CSS file dedicated to implementing the "glassmorphism" visual style used throughout the application.
-   **`styles/globals.css`**: A global stylesheet that defines the base styles and theme for the application.
-   **`styles/theme.css`**: A CSS file that defines the application's color palette (using a Morandi color scheme), typography, spacing, and other design tokens.
-   **`utils/glassEffect.ts`**: A utility script that dynamically applies a JavaScript-driven visual effect to elements with the `.glass` class to enhance the glassmorphism look.
