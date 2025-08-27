// src/main.tsx
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
import { esES, enUS } from "@clerk/localizations";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Leemos el idioma elegido en la app (guardado por useLang)
function getLang(): "en" | "es" {
  const saved = localStorage.getItem("lang");
  return saved === "es" ? "es" : "en";
}
const lang = getLang();

if (!PUBLISHABLE_KEY) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <div style={{display:"grid",placeItems:"center",height:"100vh",color:"#e11d48",fontFamily:"ui-sans-serif,system-ui"}}>
      <div>
        <strong>⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</strong>
        <div style={{marginTop:8,color:"#9ca3af"}}>
          Añádela en Vercel → Project → Settings → Environment Variables.
        </div>
      </div>
    </div>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        localization={lang === "es" ? esES : enUS}
        appearance={{ variables: { colorPrimary: "#111827", colorBackground: "transparent" } }}
      >
        <SignedIn>
          <App />
        </SignedIn>
        <SignedOut>
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
            <SignIn routing="hash" afterSignInUrl="/" signUpUrl="#/sign-up" />
          </div>
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
