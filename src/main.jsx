// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut, SignIn, SignUp } from "@clerk/clerk-react";

import App from "./App.jsx";
import "./index.css";

const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Si no hay clave, muestra mensaje en vez de pantalla en blanco
if (!pk) {
  const el = document.getElementById("root");
  if (el) {
    el.innerHTML = `
      <div style="
        min-height:100vh;display:grid;place-items:center;
        background:#0b0b0b;color:#eaeaea;font:16px system-ui, sans-serif;padding:24px;">
        <div>
          <div style="font-size:18px;margin-bottom:8px">⚠️ Falta VITE_CLERK_PUBLISHABLE_KEY</div>
          <div>Define la variable en Vercel (Production & Preview) y redeploy.</div>
        </div>
      </div>`;
  }
} else {
  // Pantalla de auth con routing hash
  const AuthScreen = () => {
    const [hash, setHash] = React.useState(window.location.hash);
    React.useEffect(() => {
      const onHash = () => setHash(window.location.hash);
      window.addEventListener("hashchange", onHash);
      return () => window.removeEventListener("hashchange", onHash);
    }, []);
    const isSignUp = hash.includes("sign-up");
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-50 dark:bg-zinc-950">
        {isSignUp ? (
          <SignUp routing="hash" signInUrl="/sign-in" />
        ) : (
          <SignIn routing="hash" signUpUrl="/sign-up" />
        )}
      </div>
    );
  };

  ReactDOM.createRoot(document.getElementById("root")).render(
    <ClerkProvider publishableKey={pk}>
      <SignedIn>
        <App />
      </SignedIn>
      <SignedOut>
        <AuthScreen />
      </SignedOut>
    </ClerkProvider>
  );
}
