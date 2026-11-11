"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { CatalogFiltersSchema, type CatalogFilters } from "@sor/contracts";
import { ACQUISITION_CHANNELS, type AcquisitionChannelCategory } from "@sor/domain/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/client-api";
import {
  AGE_BUCKETS,
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_CATEGORY,
  ACQUISITION_CHANNEL_STATUS,
  BILLING_MODEL,
  COMMERCIAL_VALIDATION,
  COMPANY_PROFILE,
  CONFIGURABLE_EXCLUSIONS,
  CUSTOMER_TYPE,
  PRICE_BANDS,
  TEAM_PRESETS,
  countryName,
} from "@/lib/labels";
import type { CategoryOption } from "./types";

/** Same limit as the catalog filter contract (acquisition_channels.values). */
const MAX_CHANNEL_VALUES = 12;
const ACQUISITION_CHANNEL_CATEGORY_ORDER: AcquisitionChannelCategory[] = [
  "content_search",
  "social",
  "community",
  "partnership",
  "paid",
  "organic",
  "other",
];

const COUNTRIES = ["US", "FR", "GB", "CA", "DE", "ES", "IT", "NL", "BE", "CH", "IE", "AU"];

function Group({
  title,
  letter,
  children,
}: {
  title: string;
  letter: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-2 border-b border-border pb-4">
      <legend className="mb-1 text-sm font-semibold">
        <span className="mr-1 text-muted">{letter}.</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm${disabled ? " text-muted" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      {label}
    </label>
  );
}

const toggle = <T,>(list: T[], value: T, on: boolean): T[] =>
  on ? [...new Set([...list, value])] : list.filter((v) => v !== value);

export function FilterPanel({
  open,
  onOpenChange,
  workspaceId,
  categories,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  categories: CategoryOption[];
  value: CatalogFilters;
  onApply: (f: CatalogFilters) => void;
}) {
  const [draft, setDraft] = useState<CatalogFilters>(value);
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // Result count before applying (PRD §4.3).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ data: { count: number } }>(`/workspaces/${workspaceId}/products/search/count`, {
        method: "POST",
        body: { filters: draft },
      })
        .then((r) => {
          if (!cancelled) {
            setCount(r.data.count);
            setCountError(false);
          }
        })
        .catch(() => !cancelled && setCountError(true));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, open, workspaceId]);

  const ct = draft.customer_types ?? { values: [], include_unknown: false };
  const team = draft.team_size ?? { presets: [], include_unknown: false };
  const hq = draft.hq_countries ?? { values: [], include_unknown: false };
  const age = draft.age ?? { buckets: [], include_unknown: false };
  const bm = draft.billing_models ?? { values: [], include_unknown: false };
  const price = draft.price_bands ?? { values: [], include_unknown: false };
  const cp = draft.company_profile ?? { values: [], include_unknown: false };
  const channels = draft.acquisition_channels ?? {
    values: [],
    statuses: [],
    include_unknown: false,
  };
  const cats = draft.categories?.slugs ?? [];
  const parents = categories.filter((c) => c.parent_id === null);
  const set = (patch: Partial<CatalogFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const [extraCountry, setExtraCountry] = useState("");

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <D.Content className="fixed top-0 right-0 z-50 flex h-full w-[min(28rem,100vw)] flex-col border-l border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border p-4">
            <D.Title className="text-lg font-semibold">Filtres</D.Title>
            <D.Close aria-label="Fermer" className="text-muted hover:text-fg">
              <X size={18} />
            </D.Close>
          </div>
          <D.Description className="px-4 pt-3 text-xs text-muted">
            ET entre les groupes, OU à l’intérieur d’un groupe. Une valeur inconnue n’est jamais
            traitée comme positive ou négative : cochez « inclure les inconnus » pour la garder.
          </D.Description>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <Group letter="A" title="Type de clientèle">
              {(["b2b", "b2c", "b2b_b2c"] as const).map((v) => (
                <Check
                  key={v}
                  label={CUSTOMER_TYPE[v] ?? v}
                  checked={ct.values.includes(v)}
                  onChange={(on) =>
                    set({ customer_types: { ...ct, values: toggle(ct.values, v, on) } })
                  }
                />
              ))}
              <Check
                label="Inclure les clientèles inconnues"
                checked={ct.include_unknown}
                onChange={(on) => set({ customer_types: { ...ct, include_unknown: on } })}
              />
            </Group>
            <Group letter="B" title="Taille de l’équipe">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {TEAM_PRESETS.map((v) => (
                  <Check
                    key={v}
                    label={`${v} pers.`}
                    checked={team.presets.includes(v)}
                    onChange={(on) =>
                      set({ team_size: { ...team, presets: toggle(team.presets, v, on) } })
                    }
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>Personnalisé</span>
                <Input
                  aria-label="Équipe minimum"
                  type="number"
                  min={0}
                  className="w-20"
                  value={team.custom?.min ?? ""}
                  onChange={(e) =>
                    set({
                      team_size: {
                        ...team,
                        custom: {
                          ...team.custom,
                          min: e.target.value === "" ? undefined : Number(e.target.value),
                        },
                      },
                    })
                  }
                />
                <span>à</span>
                <Input
                  aria-label="Équipe maximum"
                  type="number"
                  min={0}
                  className="w-20"
                  value={team.custom?.max ?? ""}
                  onChange={(e) =>
                    set({
                      team_size: {
                        ...team,
                        custom: {
                          ...team.custom,
                          max: e.target.value === "" ? undefined : Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </div>
              <Check
                label="Inclure les effectifs inconnus"
                checked={team.include_unknown}
                onChange={(on) => set({ team_size: { ...team, include_unknown: on } })}
              />
            </Group>
            <Group letter="C" title="Pays du siège">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[...new Set([...COUNTRIES, ...hq.values])].map((v) => (
                  <Check
                    key={v}
                    label={countryName(v) ?? v}
                    checked={hq.values.includes(v)}
                    onChange={(on) =>
                      set({ hq_countries: { ...hq, values: toggle(hq.values, v, on) } })
                    }
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="Autre pays (code ISO)"
                  placeholder="Code pays (ex. SE)"
                  maxLength={2}
                  className="w-40"
                  value={extraCountry}
                  onChange={(e) => setExtraCountry(e.target.value.toUpperCase())}
                />
                <Button
                  size="sm"
                  disabled={!/^[A-Z]{2}$/.test(extraCountry)}
                  onClick={() => {
                    set({ hq_countries: { ...hq, values: toggle(hq.values, extraCountry, true) } });
                    setExtraCountry("");
                  }}
                >
                  Ajouter
                </Button>
              </div>
              <Check
                label="Inclure les pays inconnus"
                checked={hq.include_unknown}
                onChange={(on) => set({ hq_countries: { ...hq, include_unknown: on } })}
              />
            </Group>
            <Group letter="D" title="Ancienneté">
              {Object.entries(AGE_BUCKETS).map(([v, label]) => (
                <Check
                  key={v}
                  label={label}
                  checked={age.buckets.includes(v as never)}
                  onChange={(on) =>
                    set({
                      age: {
                        ...age,
                        buckets: toggle(age.buckets, v as (typeof age.buckets)[number], on),
                      },
                    })
                  }
                />
              ))}
              <Check
                label="Inclure les dates inconnues"
                checked={age.include_unknown}
                onChange={(on) => set({ age: { ...age, include_unknown: on } })}
              />
            </Group>
            <Group letter="E" title="Catégories">
              <div className="space-y-2">
                {parents.map((parent) => (
                  <details key={parent.id} className="rounded border border-border p-2">
                    <summary className="cursor-pointer text-sm">
                      <label
                        className="inline-flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={cats.includes(parent.slug)}
                          onChange={(e) => {
                            const slugs = toggle(cats, parent.slug, e.target.checked);
                            set({ categories: slugs.length ? { slugs } : undefined });
                          }}
                        />
                        {parent.name} (toutes)
                      </label>
                    </summary>
                    <div className="mt-2 grid grid-cols-1 gap-1 pl-4">
                      {categories
                        .filter((c) => c.parent_id === parent.id)
                        .map((child) => (
                          <Check
                            key={child.id}
                            label={child.name}
                            checked={cats.includes(child.slug)}
                            onChange={(on) => {
                              const slugs = toggle(cats, child.slug, on);
                              set({ categories: slugs.length ? { slugs } : undefined });
                            }}
                          />
                        ))}
                    </div>
                  </details>
                ))}
              </div>
            </Group>
            <Group letter="F" title="Business model">
              {Object.entries(BILLING_MODEL).map(([v, label]) => (
                <Check
                  key={v}
                  label={label}
                  checked={bm.values.includes(v as never)}
                  onChange={(on) =>
                    set({
                      billing_models: {
                        ...bm,
                        values: toggle(bm.values, v as (typeof bm.values)[number], on),
                      },
                    })
                  }
                />
              ))}
              <Check
                label="Inclure les modèles inconnus"
                checked={bm.include_unknown}
                onChange={(on) => set({ billing_models: { ...bm, include_unknown: on } })}
              />
            </Group>
            <Group letter="G" title="Tarification (prix d’entrée mensuel indicatif en euros)">
              {Object.entries(PRICE_BANDS).map(([v, label]) => (
                <Check
                  key={v}
                  label={label}
                  checked={price.values.includes(v as never)}
                  onChange={(on) =>
                    set({
                      price_bands: {
                        ...price,
                        values: toggle(price.values, v as (typeof price.values)[number], on),
                      },
                    })
                  }
                />
              ))}
              <Check
                label="Inclure les prix inconnus"
                checked={price.include_unknown}
                onChange={(on) => set({ price_bands: { ...price, include_unknown: on } })}
              />
              <p className="text-xs text-muted">
                Conversion indicative ; une devise sans taux connu compte comme inconnue.
              </p>
            </Group>
            <Group letter="I" title="Validation commerciale">
              {Object.entries(COMMERCIAL_VALIDATION).map(([v, label]) => (
                <Check
                  key={v}
                  label={label}
                  checked={(draft.commercial_validation ?? []).includes(v as never)}
                  onChange={(on) =>
                    set({
                      commercial_validation: toggle(
                        draft.commercial_validation ?? [],
                        v as never,
                        on,
                      ),
                    })
                  }
                />
              ))}
            </Group>
            <Group letter="J" title="Profil de l’entreprise">
              {Object.entries(COMPANY_PROFILE)
                .filter(([v]) => v !== "unknown")
                .map(([v, label]) => (
                  <Check
                    key={v}
                    label={label}
                    checked={cp.values.includes(v as never)}
                    onChange={(on) =>
                      set({
                        company_profile: {
                          ...cp,
                          values: toggle(cp.values, v as (typeof cp.values)[number], on),
                        },
                      })
                    }
                  />
                ))}
              <Check
                label="Inclure les profils inconnus"
                checked={cp.include_unknown}
                onChange={(on) => set({ company_profile: { ...cp, include_unknown: on } })}
              />
            </Group>
            <Group letter="K" title="Acquisition Channels observés">
              <p className="text-xs text-muted">
                Canaux utilisés par ce SaaS pour acquérir ses clients. Ils sont distincts des
                sources qui alimentent le catalogue et des recommandations Go-to-Market.
              </p>
              {ACQUISITION_CHANNEL_CATEGORY_ORDER.map((category) => (
                <fieldset key={category} className="mt-1">
                  <legend className="text-xs font-medium text-muted">
                    {ACQUISITION_CHANNEL_CATEGORY[category]}
                  </legend>
                  {ACQUISITION_CHANNELS.filter((c) => c.category === category).map((c) => (
                    <Check
                      key={c.key}
                      label={ACQUISITION_CHANNEL[c.key] ?? c.label}
                      checked={channels.values.includes(c.key as never)}
                      disabled={
                        !channels.values.includes(c.key as never) &&
                        channels.values.length >= MAX_CHANNEL_VALUES
                      }
                      onChange={(on) =>
                        set({
                          acquisition_channels: {
                            ...channels,
                            values: toggle(channels.values, c.key as never, on),
                          },
                        })
                      }
                    />
                  ))}
                </fieldset>
              ))}
              {channels.values.length >= MAX_CHANNEL_VALUES ? (
                <p className="text-xs text-muted">
                  {MAX_CHANNEL_VALUES} canaux au maximum par recherche.
                </p>
              ) : null}
              <div className="mt-2 border-t border-border pt-2">
                <p className="mb-1 text-xs font-medium">Niveau de preuve</p>
                {(["confirmed", "declared", "estimated"] as const).map((status) => (
                  <Check
                    key={status}
                    label={ACQUISITION_CHANNEL_STATUS[status] ?? status}
                    checked={channels.statuses.includes(status)}
                    onChange={(on) =>
                      set({
                        acquisition_channels: {
                          ...channels,
                          statuses: toggle(channels.statuses, status, on),
                        },
                      })
                    }
                  />
                ))}
              </div>
              <Check
                label="Inclure les SaaS sans canal documenté"
                checked={channels.include_unknown}
                onChange={(on) =>
                  set({ acquisition_channels: { ...channels, include_unknown: on } })
                }
              />
            </Group>
            <Group letter="O" title="Exclusions configurables">
              {Object.entries(CONFIGURABLE_EXCLUSIONS).map(([v, label]) => (
                <Check
                  key={v}
                  label={label}
                  checked={draft.configurable_exclusions.includes(v as never)}
                  onChange={(on) =>
                    set({
                      configurable_exclusions: toggle(
                        draft.configurable_exclusions,
                        v as never,
                        on,
                      ),
                    })
                  }
                />
              ))}
              <p className="text-xs text-muted">
                Exclusion permanente (non modifiable) : affiliation, partenariats et modèles
                apparentés.
              </p>
            </Group>
            <Check
              label="Afficher aussi les SaaS masqués"
              checked={draft.include_hidden}
              onChange={(on) => set({ include_hidden: on })}
            />
            <p className="text-xs text-muted">
              Maturité, potentiel d’opportunité, géographie commerciale, technologie et plaintes
              clients arrivent en phase 2.
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-border p-4">
            <Button onClick={() => setDraft(CatalogFiltersSchema.parse({}))}>Réinitialiser</Button>
            <Button
              variant="primary"
              className="ml-auto"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
            >
              {countError
                ? "Appliquer"
                : count === null
                  ? "Appliquer…"
                  : `Afficher ${count} résultat${count > 1 ? "s" : ""}`}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
