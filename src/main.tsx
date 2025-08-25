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

function MissingKey() {
  return (
    <div style={{
      display: "grid",
      placeItems: "center",
      height: "100vh",
      color: "#e11d48",
      fontFamily: "ui-sans-serif,system-ui"
    }}>
      <div>
        <strong>⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</strong>
        <div style={{ marginTop: 8, color: "#9ca3af" }}>
          Añádela en Vercel → Project → Settings → Environment Variables (Preview/Prod).
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById("root")!;

if (!PUBLISHABLE_KEY) {
  ReactDOM.createRoot(root).render(<MissingKey />);
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        // Vite SPA: usa hash routing para los formularios
        signInUrl="/#/sign-in"
        signUpUrl="/#/sign-up"
        afterSignInUrl="/"
        afterSignUpUrl="/"
        appearance={{ variables: { colorPrimary: "#111827", colorBackground: "transparent" } }}
      >
        {/* Si HAY sesión -> App; si NO -> SignIn embebido (sin redirección) */}
        <SignedIn>
          <App />
        </SignedIn>
        <SignedOut>
          <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
            <SignIn routing="hash" />
          </div>
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
