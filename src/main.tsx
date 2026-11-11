import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

/** Shows a recoverable message instead of a blank page if rendering ever fails. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: "15vh auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>This page hit an error</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>Nothing was lost on the server. Go back to the search and try again.</p>
        <p style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, opacity: 0.6 }}>{this.state.error.message}</p>
        <a href="#/" onClick={() => this.setState({ error: null })} style={{ display: "inline-block", marginTop: 16 }}>
          Back to search
        </a>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
