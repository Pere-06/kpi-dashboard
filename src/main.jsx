import { ClerkProvider, SignedIn, SignedOut, SignIn, SignUp } from "@clerk/clerk-react";
import App from "./App.jsx";

const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
      {isSignUp ? <SignUp routing="hash" signInUrl="/sign-in" /> : <SignIn routing="hash" signUpUrl="/sign-up" />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <ClerkProvider publishableKey={pk}>
    <SignedIn><App /></SignedIn>
    <SignedOut><AuthScreen /></SignedOut>
  </ClerkProvider>
);
