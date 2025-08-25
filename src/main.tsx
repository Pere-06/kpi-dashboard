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
  signInUrl="/#/sign-in"
  signUpUrl="/#/sign-up"
  afterSignInUrl="/"
  afterSignUpUrl="/"
  appearance={{
    variables: {
      colorPrimary: "#3b82f6",                   // azul tailwind 'blue-500'
      colorBackground: "rgb(24 24 27)",          // zinc-900
      colorText: "rgb(244 244 245)",             // zinc-100
      colorInputBackground: "rgb(39 39 42)",     // zinc-800
      colorInputText: "rgb(244 244 245)"
    },
    elements: {
      // Card del modal de login
      card: "bg-zinc-900/95 border border-zinc-800 shadow-xl rounded-2xl",
      headerTitle: "text-zinc-100",
      headerSubtitle: "text-zinc-400",
      // Backdrop del modal
      modalBackdrop: "bg-black/60 backdrop-blur-sm",
      // Inputs
      formFieldInput:
        "bg-zinc-800 text-zinc-100 border-zinc-700 focus:border-zinc-500 focus:ring-0",
      // Botón principal
      formButtonPrimary:
        "bg-zinc-100 text-zinc-900 hover:bg-white focus:ring-0",
      // Botones sociales
      socialButtonsBlockButton:
        "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700",
      // Mensajes/links
      footerActionText: "text-zinc-400",
      footerText: "text-zinc-500"
    }
  }}
>
  <SignedIn>
    <App />
  </SignedIn>
  <SignedOut>
    <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
      <SignIn
        routing="hash"
        appearance={{
          elements: {
            card: "bg-zinc-900/95 border border-zinc-800 shadow-xl rounded-2xl",
            modalBackdrop: "bg-black/60 backdrop-blur-sm",
            formFieldInput:
              "bg-zinc-800 text-zinc-100 border-zinc-700 focus:border-zinc-500 focus:ring-0",
            formButtonPrimary:
              "bg-zinc-100 text-zinc-900 hover:bg-white focus:ring-0"
          }
        }}
      />
    </div>
  </SignedOut>
</ClerkProvider>

    </React.StrictMode>
  );
}
