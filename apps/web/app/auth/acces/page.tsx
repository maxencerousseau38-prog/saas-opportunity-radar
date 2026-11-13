import { connection } from "next/server";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-4 text-2xl font-semibold">SaaS Opportunity Radar</h1>
      <OwnerAccess />
    </main>
  );
}
