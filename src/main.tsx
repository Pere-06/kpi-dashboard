// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignIn,
} from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Apariencia Clerk: opaca + dark/light correcto
const providerAppearance = {
  variables: {
    colorPrimary: "#111827",
    colorBackground: "transparent",
    borderRadius: "0.75rem",
  },
  elements: {
    modalBackdrop: "bg-black/60",
    rootBox:
      "bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 !bg-opacity-100",
    card:
      "bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 !bg-opacity-100",

    headerTitle: "text-zinc-900 dark:text-zinc-100",
    headerSubtitle: "text-zinc-600 dark:text-zinc-400",

    socialButtonsBlockButton:
      "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",
    socialButtonsProviderIcon: "text-zinc-700 dark:text-zinc-300",
    dividerLine: "bg-zinc-200 dark:bg-zinc-800",
    dividerText: "text-zinc-500 dark:text-zinc-400",

    formFieldLabel: "text-zinc-700 dark:text-zinc-300",
    formFieldInput:
      "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
    formFieldInputShowPasswordButton: "text-zinc-500 dark:text-zinc-400",
    formButtonPrimary:
      "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200",

    footer:
      "bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 !bg-opacity-100",
    footerActionText: "text-zinc-600 dark:text-zinc-400",
    footerActionLink: "text-indigo-600 dark:text-indigo-400 hover:underline",

    userButtonPopoverCard:
      "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl !bg-opacity-100 shadow-xl",
    userButtonPopoverHeader:
      "bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800",
    userPreview: "text-zinc-900 dark:text-zinc-100",
    userPreviewSecondaryIdentifier: "text-zinc-600 dark:text-zinc-400",
    userButtonPopoverActionButton:
      "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100",
    userButtonPopoverActionIcon: "text-zinc-500 dark:text-zinc-400",
    userButtonPopoverFooter:
      "bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400",
  },
};

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
        {/* 🔐 Bloqueo de toda la app tras login */}
        <SignedIn>
          <App />
        </SignedIn>

        <SignedOut>
          {/* Contenedor neutro detrás del modal */}
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
            <SignIn
              routing="hash"         // Vite SPA sin rutas de servidor
              afterSignInUrl="/"      // vuelve a la home tras login
              signUpUrl="#/sign-up"   // registro en el mismo modal
            />
          </div>
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
