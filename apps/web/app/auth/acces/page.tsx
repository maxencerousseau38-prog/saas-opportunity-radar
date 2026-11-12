import { OwnerAccess } from "./owner-access";

export const metadata = {
  title: "Accès personnel — SaaS Opportunity Radar",
  referrer: "no-referrer",
};

export default function OwnerAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-4 text-2xl font-semibold">SaaS Opportunity Radar</h1>
      <OwnerAccess />
    </main>
  );
}
