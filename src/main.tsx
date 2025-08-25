import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const isDev = import.meta.env.DEV;
const bypass = isDev && typeof window !== "undefined" && window.location.hash.includes("__bypass");

const MissingClerk: React.FC = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#0b0b0b",
      color: "#eaeaea",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
      padding: 16,
    }}
  >
    <div
      style={{
        maxWidth: 720,
        width: "100%",
        border: "1px solid #333",
        borderRadius: 12,
        background: "#111",
        padding: 16,
        lineHeight: 1.4,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</h2>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Crea <code>.env.local</code> en la raíz con:<br />
          <code>VITE_CLERK_PUBLISHABLE_KEY=pk_test_…</code>
        </li>
        <li>Reinicia <code>npm run dev</code>.</li>
        <li>
          Para entrar sin Clerk en <b>dev</b> añade{" "}
          <code>#__bypass</code> a la URL:
          <div style={{ marginTop: 6 }}>
            <code>http://localhost:5173/#__bypass</code>
          </div>
        </li>
      </ol>
    </div>
  </div>
);

const Root: React.FC = () => {
  // 1) Si hay clave → usamos Clerk
  if (clerkKey) {
    return (
      <ClerkProvider publishableKey={clerkKey}>
        <App />
      </ClerkProvider>
    );
  }
  // 2) Si no hay clave pero estamos en dev con bypass → seguimos sin Clerk
  if (bypass) {
    return <App />;
  }
  // 3) Si no hay clave ni bypass → mostramos explicación
  return <MissingClerk />;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
