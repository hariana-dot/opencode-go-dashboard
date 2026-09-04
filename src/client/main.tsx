import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { PrefsProvider } from "./lib/prefs";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </ErrorBoundary>
  </StrictMode>
);
