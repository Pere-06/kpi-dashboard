import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import {
  ClerkProvider,
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignIn,
} from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

/* Apariencia consistente (evita transparencias) */
const providerAppearance = {
  variables: {
    colorPrimary: "#111827",
    // forzamos buen contraste en inputs
    colorText: "#111827",
    colorInputBackground: "#ffffff",
    colorInputText: "#111827",
  },
  elements: {
    /* Overlay del modal */
    modalBackdrop: "bg-black/60",

    /* Contenedores (evitar transparencias) */
    rootBox:
      "bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 !bg-opacity-100",
    card:
      "bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 !bg-opacity-100",

    /* Headings */
    headerTitle: "text-zinc-900 dark:text-zinc-100",
    headerSubtitle: "text-zinc-500 dark:text-zinc-400",

    /* —— SEPARADOR “or” —— */
    dividerText: "text-zinc-500 dark:text-zinc-400",
    dividerLine: "bg-zinc-200 dark:bg-zinc-800",

    /* —— FORM EMAIL —— */
    formFieldLabel: "text-zinc-700 dark:text-zinc-300",
    formFieldInput:
      "bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500",

    /* Botón primario */
    formButtonPrimary:
      "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200",

    /* Botones sociales (Google) */
    socialButtonsBlockButton:
      "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100",

    /* Footer */
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
          Añádela en Vercel → Project → Settings → Environment Variables.
        </div>
      </div>
    </div>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={providerAppearance}>
        {/* Evita el “flicker” mientras Clerk carga sesión */}
        <ClerkLoading>
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950 text-zinc-500">
            Loading…
          </div>
        </ClerkLoading>

        <ClerkLoaded>
          {/* SI hay sesión -> App; SI NO -> pantalla de SignIn centrada */}
          <SignedIn>
            <App />
          </SignedIn>

          <SignedOut>
            <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
              <SignIn
                routing="hash"            /* SPA con Vite: usa hash para evitar 404 en rutas */
                afterSignInUrl="/"         /* tras login vuelve al dashboard */
                signUpUrl="#/sign-up"
                appearance={providerAppearance}
              />
            </div>
          </SignedOut>
        </ClerkLoaded>
      </ClerkProvider>
    </React.StrictMode>
  );
}
