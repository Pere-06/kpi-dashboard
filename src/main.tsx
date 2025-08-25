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

if (!PUBLISHABLE_KEY) {
  // Mensaje claro si falta la key en el deploy
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <div style="display:grid;place-items:center;height:100vh;color:#e11d48;font-family:ui-sans-serif,system-ui">
      <div>
        <strong>⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</strong>
        <div style="margin-top:8px;color:#9ca3af">
          Añádela en Vercel → Project → Settings → Environment Variables (Preview/Production).
        </div>
      </div>
    </div>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        // Opcional: estilos de marca
        appearance={{ variables: { colorPrimary: "#111827", colorBackground: "transparent" } }}
      >
        {/* Si HAY sesión → app. Si NO hay sesión → SignIn en modalidad hash (Vite SPA) */}
        <SignedIn>
          <App />
        </SignedIn>
        <SignedOut>
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
            <SignIn
              routing="hash"
              afterSignInUrl="/"
              signUpUrl="#/sign-up"
            />
          </div>
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
