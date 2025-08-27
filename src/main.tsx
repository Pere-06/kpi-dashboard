import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { ClerkProvider } from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Apariencia endurecida: sin transparencias + buen contraste en claro/oscuro
const providerAppearance = {
  variables: {
    colorPrimary: "#111827",
  },
  elements: {
    // Fondo del modal (oscurece y evita ver la página detrás)
    modalBackdrop: "bg-black/60 backdrop-blur-[2px]",

    // Contenedores sin transparencia
    rootBox:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800",
    card:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800",

    // Tipografías
    headerTitle: "text-zinc-900 dark:text-zinc-100",
    headerSubtitle: "text-zinc-600 dark:text-zinc-400",

    // Inputs y botones
    formFieldInput:
      "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100",
    formButtonPrimary:
      "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200",

    socialButtonsBlockButton:
      "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100",

    // Footer
    footerActionText: "text-zinc-500 dark:text-zinc-400",
    footerActionLink: "text-indigo-600 dark:text-indigo-400 hover:underline",
  },
} as const;

if (!PUBLISHABLE_KEY) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100vh",
        color: "#e11d48",
        fontFamily: "ui-sans-serif,system-ui",
      }}
    >
      <div>
        <strong>⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</strong>
        <div style={{ marginTop: 8, color: "#9ca3af" }}>
          Añádela en Vercel → Project → Settings → Environment Variables (Preview/Production).
        </div>
      </div>
    </div>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={providerAppearance}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
}
