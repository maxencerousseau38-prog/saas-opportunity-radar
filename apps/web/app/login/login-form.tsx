"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/states";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const recoveryHandled = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (recoveryHandled.current) return;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    // SSR email confirmation commonly returns a PKCE code in the query string.
    // Exchange it in the browser so @supabase/ssr persists the session cookies.
    if (code) {
      recoveryHandled.current = true;
      url.searchParams.delete("code");
      window.history.replaceState(null, document.title, url.pathname + url.search + url.hash);
      setRecovering(true);

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { detectSessionInUrl: false } },
      );

      void supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
        if (exchangeError) {
          setRecovering(false);
          setRecoveryMessage("Ce lien n'est plus valide ou a déjà été utilisé. Demande un nouvel e-mail.");
          return;
        }
        router.replace("/");
        router.refresh();
      }).catch(() => {
        setRecovering(false);
        setRecoveryMessage("Impossible de vérifier ce lien. Demande un nouvel e-mail.");
      });
      return;
    }

    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");
    const errorCode = params.get("error_code");
    const isPasswordFlow = type === "recovery" || type === "invite";
    const isSignupFlow = type === "signup";

    // Supabase's default email templates can redirect with tokens in the URL
    // fragment. The fragment is never sent to the server; establish the
    // session in the browser and let @supabase/ssr persist it in cookies.
    if (!isPasswordFlow && !isSignupFlow && !errorCode) return;

    recoveryHandled.current = true;
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDescription = params.get("error_description");

    // Remove credentials from the address bar before making any network call.
    window.history.replaceState(null, document.title, url.pathname + url.search);

    if (errorCode) {
      setRecoveryMessage(
        errorCode === "otp_expired"
          ? "Ce lien a expiré ou a déjà été utilisé. Demande un nouvel e-mail."
          : errorDescription ?? "Le lien d'authentification n'est pas valide.",
      );
      return;
    }

    if (!accessToken || !refreshToken) {
      setRecoveryMessage("Le lien ne contient pas les informations nécessaires. Demande un nouvel e-mail.");
      return;
    }

    setRecovering(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { detectSessionInUrl: false } },
    );

    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setRecovering(false);
          setRecoveryMessage(
            "Ce lien n'est plus valide ou a déjà été utilisé. Demande un nouvel e-mail.",
          );
          return;
        }
        router.replace(isPasswordFlow ? "/account/password" : "/");
        router.refresh();
      })
      .catch(() => {
        setRecovering(false);
        setRecoveryMessage("Impossible de vérifier ce lien. Demande un nouvel e-mail.");
      });
  }, [router]);

  if (recovering) {
    return (
      <p role="status" className="text-sm text-muted">
        Vérification du lien sécurisé…
      </p>
    );
  }

  return (
    <>
      {recoveryMessage ? <ErrorNote>{recoveryMessage}</ErrorNote> : null}
      <form action={action} className="space-y-4">
        <Field label="Adresse e-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </>
  );
}
