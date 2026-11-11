"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ACQUISITION_CHANNELS } from "@sor/domain/channels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import {
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_CATEGORY,
  ACQUISITION_CHANNEL_STATUS,
  VISUAL_ASSET_TYPE,
  formatDate,
} from "@/lib/labels";

export interface ChannelAdminRow {
  id: string;
  product_name: string | null;
  product_slug: string | null;
  channel_key: string;
  channel_category: string;
  role: string;
  status: string;
  confidence: number | null;
  confidence_reasons: string[];
  observed_at: string;
  excerpt: string | null;
  source_url: string | null;
}

export interface VisualAssetAdminRow {
  id: string;
  product_name: string | null;
  asset_type: string;
  source_url: string;
  rights_basis: string;
  rights_status: string;
  rights_evidence_url: string | null;
  is_current: boolean;
  is_primary: boolean;
  width: number | null;
  height: number | null;
  removed_at: string | null;
  removal_reason: string | null;
  last_checked_at: string | null;
  last_check_status: string | null;
  created_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Acquisition Channels of catalog SaaS (ADR-017): recorded from a source the
 * operator cites, with the registry key, factual status, role and the
 * deterministic confidence computed server-side.
 */
export function AcquisitionChannelsAdmin({ channels }: { channels: ChannelAdminRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState("declared");
  const [role, setRole] = useState("secondary");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    try {
      const res = await api<{ data: { channel_key: string; confidence: number } }>(
        "/operator/acquisition-channels",
        {
          method: "POST",
          body: {
            product_slug: text("product_slug"),
            channel: text("channel"),
            role,
            status,
            evidence_kind: text("evidence_kind"),
            verified: f.get("verified") === "on",
            direct_excerpt: f.get("direct_excerpt") === "on",
            source_url: text("source_url"),
            excerpt: text("excerpt"),
            observed_at: text("observed_at"),
            ...(text("rationale") ? { rationale: text("rationale") } : {}),
            ...(text("role_rationale") ? { role_rationale: text("role_rationale") } : {}),
          },
        },
      );
      setSaved(
        `Canal enregistré : ${ACQUISITION_CHANNEL[res.data.channel_key] ?? res.data.channel_key} (confiance ${res.data.confidence}%)`,
      );
      e.currentTarget?.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function retract(id: string) {
    setError(null);
    try {
      await api(`/operator/acquisition-channels/${id}/retraction`, {
        method: "POST",
        body: { reason: reasons[id]?.trim() },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      aria-labelledby="channels-admin-title"
    >
      <h2 id="channels-admin-title" className="font-semibold">
        Acquisition Channels documentés
      </h2>
      <p className="text-sm text-muted">
        Canaux qu’un SaaS du catalogue utilise pour acquérir ses clients, enregistrés depuis une
        source que vous citez (SOR ne la télécharge pas). Ne pas confondre avec les sources du
        catalogue ni avec les recommandations Go-to-Market. Confirmé : preuve directe vérifiée ;
        déclaré : affirmation de l’entreprise ; estimé : inférence expliquée. Un canal principal
        exige un extrait qui l’établit.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {saved ? (
        <p role="status" className="text-sm text-success">
          {saved}
        </p>
      ) : null}
      <form
        onSubmit={(e) => void submit(e)}
        className="grid gap-2 sm:grid-cols-2"
        aria-label="Documenter un canal"
      >
        <label className="space-y-1 text-sm">
          <span>Slug du SaaS</span>
          <Input name="product_slug" required placeholder="ex. metricflow" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Canal</span>
          <Select name="channel" required defaultValue="">
            <option value="" disabled>
              Choisir un canal…
            </option>
            {ACQUISITION_CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} — {ACQUISITION_CHANNEL_CATEGORY[c.category]}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Statut factuel</span>
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="confirmed">Confirmé</option>
            <option value="declared">Déclaré</option>
            <option value="estimated">Estimé</option>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Rôle</span>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="secondary">Secondaire</option>
            <option value="primary">Principal</option>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Nature de la preuve</span>
          <Select
            name="evidence_kind"
            defaultValue="official_statement"
            key={status === "estimated" ? "inference" : "statement"}
          >
            {status === "estimated" ? (
              <option value="inference">Inférence (indices)</option>
            ) : (
              <>
                <option value="official_statement">Source officielle de l’entreprise</option>
                <option value="third_party_report">Source indépendante</option>
              </>
            )}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Date d’observation</span>
          <Input name="observed_at" type="date" required defaultValue={today()} max={today()} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>URL de la source (https)</span>
          <Input name="source_url" type="url" required placeholder="https://…" />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>Extrait ou résumé autorisé de la source</span>
          <Input name="excerpt" required maxLength={2000} />
        </label>
        {status === "estimated" ? (
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Méthode et indices de l’estimation</span>
            <Input name="rationale" required maxLength={1000} />
          </label>
        ) : null}
        {role === "primary" ? (
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Extrait qui établit que le canal est principal</span>
            <Input name="role_rationale" required maxLength={1000} />
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="verified" className="accent-accent" /> J’ai ouvert la source
          et elle affirme ce canal
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="direct_excerpt" className="accent-accent" /> L’extrait est
          une citation directe
        </label>
        <div className="sm:col-span-2">
          <Button type="submit">Enregistrer le canal</Button>
        </div>
      </form>
      {channels.length === 0 ? (
        <EmptyState title="Aucun canal documenté pour l’instant" />
      ) : (
        <ul className="space-y-2">
          {channels.map((c) => (
            <li
              key={c.id}
              className="space-y-1 rounded border border-border p-3 text-sm"
              data-testid="channel-admin-row"
            >
              <p className="font-medium">
                {c.product_name ?? "?"} · {c.role === "primary" ? "★ " : ""}
                {ACQUISITION_CHANNEL[c.channel_key] ?? c.channel_key}{" "}
                <Badge>{ACQUISITION_CHANNEL_STATUS[c.status] ?? c.status}</Badge>{" "}
                <span className="text-xs text-muted">
                  confiance {c.confidence ?? "?"}% · observé le {formatDate(c.observed_at)}
                </span>
              </p>
              {c.excerpt ? <p className="text-muted">« {c.excerpt} »</p> : null}
              {c.confidence_reasons.length ? (
                <p className="text-xs text-muted">{c.confidence_reasons.join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {c.source_url ? (
                  <a
                    className="text-accent underline"
                    href={c.source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Source
                  </a>
                ) : null}
                <Input
                  aria-label={`Motif du retrait du canal ${c.channel_key} de ${c.product_name ?? "?"}`}
                  placeholder="Motif (obligatoire pour retirer)"
                  className="max-w-xs"
                  value={reasons[c.id] ?? ""}
                  onChange={(e) => setReasons((x) => ({ ...x, [c.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!reasons[c.id]?.trim()}
                  onClick={() => void retract(c.id)}
                >
                  Retirer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Admitted product visuals (ADR-016). Admission runs from the worker CLI
 * (`pnpm assets:admit`), which downloads nothing unless the documented rights
 * cover a private copy. Removal here hides the visual and deletes its copy.
 */
export function VisualAssetsAdmin({ assets }: { assets: VisualAssetAdminRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  async function remove(id: string) {
    setError(null);
    try {
      await api(`/operator/visual-assets/${id}/removal`, {
        method: "POST",
        body: { reason: reasons[id]?.trim() },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      aria-labelledby="visuals-admin-title"
    >
      <h2 id="visuals-admin-title" className="font-semibold">
        Visuels produits ({assets.filter((a) => a.is_current).length} affichables)
      </h2>
      <p className="text-sm text-muted">
        Seuls les visuels dont les droits documentés couvrent une copie privée sont admis, depuis la
        commande <code>pnpm assets:admit</code> (manifeste avec la base de droits et sa preuve). Un
        visuel inconnu ou restreint n’est jamais téléchargé ni affiché. Retirer un visuel le masque
        immédiatement et supprime sa copie.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {assets.length === 0 ? (
        <EmptyState title="Aucun visuel admis : Discover affiche le repli honnête (logo, catégorie, description)" />
      ) : (
        <ul className="space-y-2">
          {assets.map((a) => (
            <li
              key={a.id}
              className="space-y-1 rounded border border-border p-3 text-sm"
              data-testid="visual-admin-row"
            >
              <p className="font-medium">
                {a.product_name ?? "?"} · {VISUAL_ASSET_TYPE[a.asset_type] ?? a.asset_type}{" "}
                <Badge tone={a.is_current ? "success" : "neutral"}>
                  {a.rights_status === "removed"
                    ? "Retiré"
                    : a.is_current
                      ? "Affichable"
                      : `Masqué (${a.last_check_status ?? "?"})`}
                </Badge>
                {a.width && a.height ? (
                  <span className="text-xs text-muted">
                    {" "}
                    {a.width}×{a.height}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">Droits : {a.rights_basis}</p>
              <p className="flex flex-wrap gap-3 text-xs">
                <a
                  className="text-accent underline"
                  href={a.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  Source du visuel
                </a>
                {a.rights_evidence_url ? (
                  <a
                    className="text-accent underline"
                    href={a.rights_evidence_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Preuve des droits
                  </a>
                ) : null}
                <span className="text-muted">
                  admis le {formatDate(a.created_at)}
                  {a.last_checked_at ? ` · vérifié le ${formatDate(a.last_checked_at)}` : ""}
                  {a.removal_reason ? ` · retrait : ${a.removal_reason}` : ""}
                </span>
              </p>
              {a.rights_status !== "removed" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Motif du retrait du visuel de ${a.product_name ?? "?"}`}
                    placeholder="Motif (obligatoire pour retirer)"
                    className="max-w-xs"
                    value={reasons[a.id] ?? ""}
                    onChange={(e) => setReasons((x) => ({ ...x, [a.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!reasons[a.id]?.trim()}
                    onClick={() => void remove(a.id)}
                  >
                    Retirer le visuel
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
