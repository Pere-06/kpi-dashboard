import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  SignIn,
} from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingKey() {
  return (
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
          Añádela en Vercel → Project → Settings → Environment Variables (Preview/Prod).
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root")!;

if (!PUBLISHABLE_KEY) {
  ReactDOM.createRoot(rootEl).render(<MissingKey />);
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        // Rutas explícitas para Vite SPA con hash routing
        signInUrl="/#/sign-in"
        signUpUrl="/#/sign-up"
        afterSignInUrl="/"
        afterSignUpUrl="/"
        appearance={{ variables: { colorPrimary: "#111827", colorBackground: "transparent" } }}
      >
        {/* Si HAY sesión → App; si NO → forzamos login */}
        <SignedIn>
          <App />
        </SignedIn>
        <SignedOut>
          {/* Opción A: redirigir a la pantalla de sign-in */}
          <RedirectToSignIn redirectUrl="/" />
          {/* Opción B (fallback visible si la redirección estuviera bloqueada): */}
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
            <SignIn routing="hash" />
          </div>
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
