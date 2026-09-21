import ReactDOM from "react-dom/client";
import { StrictMode } from "react";
import "@fontsource/oxanium/400.css";
import "@fontsource/oxanium/500.css";
import "@fontsource/oxanium/600.css";
import "@fontsource/oxanium/700.css";
import "@fontsource/oxanium/800.css";
import "@fontsource-variable/noto-sans-sc";
import "./styles/main.scss";

async function bootstrap() {
  const { default: App } = await import("./App");
  const { useAppStore } = await import('./state/appStore');
  document.documentElement.dataset.theme = useAppStore.getState().theme;
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement,
  );

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void bootstrap();
