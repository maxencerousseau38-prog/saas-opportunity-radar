"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/ui/states";
import { ownerSignIn, type OwnerAccessResult } from "./actions";

const MESSAGES: Record<Exclude<OwnerAccessResult, "ok"> | "missing", string> = {
  missing: "Ce lien d’accès est incomplet.",
  refused: "Ce lien d’accès n’est pas valide.",
  disabled: "L’accès personnel par lien n’est pas activé sur ce site.",
  error: "La connexion a échoué. Réessaie dans un instant.",
};

/** Reads the secret from the URL fragment, removes it from the address bar, signs in. */
export function OwnerAccess() {
  const [problem, setProblem] = useState<keyof typeof MESSAGES | null>(null);
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const secret = decodeURIComponent(window.location.hash.slice(1));
    window.history.replaceState(null, document.title, window.location.pathname);
    if (!secret) {
      setProblem("missing");
      return;
    }
    ownerSignIn(secret)
      .then((result) => {
        if (result !== "ok") return setProblem(result);
        router.replace("/");
        router.refresh();
      })
      .catch(() => setProblem("error"));
  }, [router]);

  if (!problem) {
    return (
      <p role="status" className="text-sm text-muted">
        Connexion à ton espace en cours…
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <ErrorNote>{MESSAGES[problem]}</ErrorNote>
      <Link href="/login" className="text-sm font-medium text-fg underline underline-offset-4">
        Se connecter avec un mot de passe
      </Link>
    </div>
  );
}
