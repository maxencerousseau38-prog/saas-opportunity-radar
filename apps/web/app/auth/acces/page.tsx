import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { OwnerAccess } from "./owner-access";

export const metadata = {
  title: "Accès personnel — SaaS Opportunity Radar",
  referrer: "no-referrer",
};

export default async function OwnerAccessPage() {
  // Rendered per request: the CSP nonce (proxy.ts) must reach the page's
  // scripts. A prerendered page carries none and its scripts are blocked.
  await connection();
  return (
    <AuthShell title="SaaS Opportunity Radar" description="Accès personnel à ton radar.">
      <OwnerAccess />
    </AuthShell>
  );
}
