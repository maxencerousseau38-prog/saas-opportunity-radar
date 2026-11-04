"use client";
import { useState } from "react";
import { BarChart3, EyeOff, Eye, Flag, FolderPlus, MoreHorizontal, Star } from "lucide-react";
import type { ProductCard } from "@sor/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/client-api";
import { REPORT_TYPE } from "@/lib/labels";

export interface ActionProps {
  workspaceId: string;
  canEdit: boolean;
  collections: Array<{ id: string; name: string }>;
  onCollectionCreated: (c: { id: string; name: string }) => void;
  onChange: (id: string, patch: Partial<ProductCard["workspace"]>) => void;
}

export function ProductActions({ product, ...p }: ActionProps & { product: ProductCard }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ws = product.workspace;

  async function patchState(patch: { is_favorite?: boolean; is_hidden?: boolean }) {
    try {
      await api(`/workspaces/${p.workspaceId}/products/${product.id}/state`, {
        method: "PATCH",
        body: patch,
      });
      p.onChange(product.id, patch);
    } catch (err) {
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
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label={
          ws.is_favorite
            ? `Retirer ${product.name} des favoris`
            : `Ajouter ${product.name} aux favoris`
        }
        aria-pressed={ws.is_favorite}
        disabled={!p.canEdit}
        onClick={() => void patchState({ is_favorite: !ws.is_favorite })}
      >
        <Star size={16} className={ws.is_favorite ? "fill-warning text-warning" : ""} />
      </Button>
      <Menu
        label={`Actions pour ${product.name}`}
        trigger={
          <Button size="icon" variant="ghost">
            <MoreHorizontal size={16} />
          </Button>
        }
      >
        <MenuItem disabled={!p.canEdit} onSelect={() => setCollectionOpen(true)}>
          <FolderPlus size={14} /> Ajouter à une collection…
        </MenuItem>
        <MenuItem
          disabled={!p.canEdit}
          onSelect={() => void patchState({ is_hidden: !ws.is_hidden })}
        >
          {ws.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}{" "}
          {ws.is_hidden ? "Ne plus masquer" : "Masquer ce SaaS"}
        </MenuItem>
        <MenuItem disabled={!p.canEdit} onSelect={() => setReportOpen(true)}>
          <Flag size={14} /> Signaler une erreur…
        </MenuItem>
        <MenuItem disabled>
          <BarChart3 size={14} /> Analyser avec l’IA (Sprint 5)
        </MenuItem>
      </Menu>
      {notice ? (
        <span role="status" className="text-xs text-muted">
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
                <Button className="w-full justify-start" onClick={() => onPick(c.id)}>
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
