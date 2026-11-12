"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  EyeOff,
  Eye,
  ExternalLink,
  Flag,
  FolderPlus,
  MessageSquareText,
  MoreHorizontal,
  Star,
} from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { REPORT_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface ActionProps {
  workspaceId: string;
  canEdit: boolean;
  collections: Array<{ id: string; name: string }>;
  onCollectionCreated: (c: { id: string; name: string }) => void;
  onChange: (id: string, patch: Partial<ProductCard["workspace"]>) => void;
}

export function ProductActions({
  product,
  className,
  ...p
}: ActionProps & { product: ProductCard; className?: string }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ws = product.workspace;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function patchState(patch: { is_favorite?: boolean; is_hidden?: boolean }) {
    const previous = { is_favorite: ws.is_favorite, is_hidden: ws.is_hidden };
    // Optimistic: the star reacts at once, the server confirms or reverts.
    if (patch.is_favorite !== undefined) p.onChange(product.id, { is_favorite: patch.is_favorite });
    try {
      await api(`/workspaces/${p.workspaceId}/products/${product.id}/state`, {
        method: "PATCH",
        body: patch,
      });
      p.onChange(product.id, patch);
      if (patch.is_hidden !== undefined)
        setNotice(patch.is_hidden ? "SaaS masqué." : "SaaS de nouveau visible.");
    } catch (err) {
      if (patch.is_favorite !== undefined)
        p.onChange(product.id, { is_favorite: previous.is_favorite });
      setNotice(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function addTo(collectionId: string) {
    try {
      await api(`/workspaces/${p.workspaceId}/collections/${collectionId}/items`, {
        method: "POST",
        body: { product_id: product.id },
      });
      p.onChange(product.id, { in_collection: true });
      setNotice("Ajouté à la collection.");
    } catch (err) {
      setNotice(
        err instanceof Error && err.message.includes("état")
          ? "Déjà dans cette collection."
          : err instanceof Error
            ? err.message
            : "Erreur",
      );
    }
  }

  return (
    <div className={cn("relative z-10 flex items-center", className)}>
      <button
        type="button"
        aria-label={
          ws.is_favorite
            ? `Retirer ${product.name} des favoris`
            : `Ajouter ${product.name} aux favoris`
        }
        aria-pressed={ws.is_favorite}
        disabled={!p.canEdit}
        onClick={() => void patchState({ is_favorite: !ws.is_favorite })}
        className="grid size-9 place-items-center rounded-full text-muted transition-[color,transform] hover:bg-surface-2 hover:text-fg active:scale-90 disabled:opacity-40"
      >
        <Star
          size={18}
          className={cn(
            "transition-transform",
            ws.is_favorite && "scale-110 fill-warning text-warning",
          )}
        />
      </button>
      <Menu
        label={`Actions pour ${product.name}`}
        trigger={
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <MoreHorizontal size={18} />
          </button>
        }
      >
        <MenuItem disabled={!p.canEdit} onSelect={() => setCollectionOpen(true)}>
          <FolderPlus size={16} /> Ajouter à une collection…
        </MenuItem>
        <MenuItem
          disabled={!p.canEdit}
          onSelect={() => router.push(`/w/${p.workspaceId}/ask-ai?products=${product.id}`)}
        >
          <MessageSquareText size={16} /> Ask AI — dossier externe
        </MenuItem>
        {product.website_url ? (
          <MenuItem onSelect={() => window.open(product.website_url!, "_blank", "noopener")}>
            <ExternalLink size={16} /> Site officiel
          </MenuItem>
        ) : null}
        <MenuItem
          disabled={!p.canEdit}
          onSelect={() => void patchState({ is_hidden: !ws.is_hidden })}
        >
          {ws.is_hidden ? <Eye size={16} /> : <EyeOff size={16} />}{" "}
          {ws.is_hidden ? "Ne plus masquer" : "Masquer ce SaaS"}
        </MenuItem>
        <MenuItem disabled={!p.canEdit} onSelect={() => setReportOpen(true)}>
          <Flag size={16} /> Signaler une erreur…
        </MenuItem>
        <MenuItem
          disabled={!p.canEdit}
          onSelect={() => router.push(`/w/${p.workspaceId}/saas/${product.slug}#internal-analysis`)}
        >
          <BarChart3 size={16} /> Ouvrir l’analyse interne
        </MenuItem>
      </Menu>
      {notice ? (
        <span
          role="status"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-full border border-border bg-surface-2/95 px-4 py-2 text-sm whitespace-nowrap text-fg shadow-xl backdrop-blur lg:bottom-8"
        >
          {notice}
        </span>
      ) : null}
      <CollectionDialog
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        productName={product.name}
        workspaceId={p.workspaceId}
        collections={p.collections}
        onCreated={p.onCollectionCreated}
        onPick={(id) => {
          setCollectionOpen(false);
          void addTo(id);
        }}
      />
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        workspaceId={p.workspaceId}
        productId={product.id}
        productName={product.name}
      />
    </div>
  );
}

export function CollectionDialog({
  open,
  onOpenChange,
  productName,
  workspaceId,
  collections,
  onCreated,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productName: string;
  workspaceId: string;
  collections: Array<{ id: string; name: string }>;
  onCreated: (c: { id: string; name: string }) => void;
  onPick: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      const res = await api<{ data: { id: string; name: string } }>(
        `/workspaces/${workspaceId}/collections`,
        {
          method: "POST",
          body: { name },
        },
      );
      onCreated(res.data);
      setName("");
      onPick(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter à une collection"
      description={productName}
    >
      <div className="space-y-3">
        {collections.length ? (
          <ul className="space-y-1">
            {collections.map((c) => (
              <li key={c.id}>
                <Button className="h-11 w-full justify-start" onClick={() => onPick(c.id)}>
                  {c.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune collection pour l’instant.</p>
        )}
        <div className="flex gap-2">
          <Input
            aria-label="Nom de la nouvelle collection"
            placeholder="Nouvelle collection"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <Button variant="primary" disabled={!name.trim()} onClick={() => void create()}>
            Créer et ajouter
          </Button>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

export function ReportDialog({
  open,
  onOpenChange,
  workspaceId,
  productId,
  productName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  productId: string;
  productName: string;
}) {
  const [type, setType] = useState("incorrect_information");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  async function submit() {
    try {
      await api(`/workspaces/${workspaceId}/products/${productId}/reports`, {
        method: "POST",
        body: { report_type: type, message },
      });
      setState("sent");
      setMessage("");
    } catch {
      setState("error");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setState("idle");
      }}
      title="Signaler une erreur"
      description={`${productName} — le signalement est examiné par l’opérateur de la plateforme.`}
    >
      {state === "sent" ? (
        <p role="status" className="text-sm">
          Merci, le signalement a été enregistré.
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Type" htmlFor="report-type">
            <Select id="report-type" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(REPORT_TYPE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="report-message">
            <Textarea
              id="report-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              required
            />
          </Field>
          {state === "error" ? <ErrorNote>Le signalement n’a pas pu être envoyé.</ErrorNote> : null}
          <Button variant="primary" disabled={!message.trim()} onClick={() => void submit()}>
            Envoyer
          </Button>
        </div>
      )}
    </Dialog>
  );
}
