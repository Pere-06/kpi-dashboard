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
    colorText: "#0b0f19",
    colorTextSecondary: "#4b5563",
  },
  elements: {
    modalBackdrop: "bg-black/60",

    rootBox:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800",
    card:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800",

    headerTitle: "text-zinc-900 dark:text-zinc-100",
    headerSubtitle: "text-zinc-500 dark:text-zinc-400",

    formFieldLabel: "text-zinc-700 dark:text-zinc-300",
    formFieldInput:
      "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-800",
    formButtonPrimary:
      "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200",

    socialButtonsBlockButton:
      "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700",

    footerActionText: "text-zinc-500 dark:text-zinc-400",
    footerActionLink: "text-indigo-600 dark:text-indigo-400 hover:underline",

    /* ---------- UserButton popover ---------- */
    userButtonPopoverCard:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl",
    userPreview: "text-zinc-900 dark:text-zinc-100",
    userButtonPopoverActionButton: "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100",
    userButtonPopoverFooter: "border-t border-zinc-200 dark:border-zinc-800",

    /* ---------- UserProfile (Manage account) ---------- */
    userProfileRoot:
      "bg-white dark:bg-zinc-900 !bg-opacity-100 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl",
    userProfileContent: "bg-white dark:bg-zinc-900 !bg-opacity-100",
    userProfilePage: "bg-white dark:bg-zinc-900 !bg-opacity-100",

    /* cabecera y secciones */
    userProfileHeaderTitle: "text-zinc-900 dark:text-zinc-100",
    userProfileHeaderSubtitle: "text-zinc-600 dark:text-zinc-400",
    userProfileSectionTitle: "text-zinc-800 dark:text-zinc-200",
    userProfileSection: "bg-transparent",
    userProfileSectionContent: "bg-transparent",

    /* sidebar + items del menú */
    userProfileNavbar: "bg-transparent",
    userProfileSidebar:
      "bg-zinc-50/40 dark:bg-zinc-900/70 !bg-opacity-100 border-r border-zinc-200 dark:border-zinc-800",
    userProfileSidebarRow:
      "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100",
    userProfileSidebarFooter: "text-zinc-500 dark:text-zinc-400",

    /* badges (Primary, etc.) */
    badge:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700",

    /* inputs/acciones dentro del perfil */
    formButtonReset: "text-zinc-700 dark:text-zinc-300 hover:underline",
    icon: "text-zinc-700 dark:text-zinc-300",
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
