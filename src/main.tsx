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
  // ... lo que ya tienes (rootBox, card, etc)

  /* USER BUTTON + ACCOUNT MODAL */
  userButtonPopoverCard:
    "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl !bg-opacity-100",

  userButtonPopoverHeader:
    "bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800",

  userPreview:
    "text-zinc-900 dark:text-zinc-100 font-medium",

  userPreviewSecondaryIdentifier:
    "text-zinc-600 dark:text-zinc-400",

  userButtonPopoverActionButton:
    "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100",

  userButtonPopoverFooter:
    "bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400",

  /* OPCIONAL: iconos */
  userButtonPopoverActionIcon:
    "text-zinc-500 dark:text-zinc-400",
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
