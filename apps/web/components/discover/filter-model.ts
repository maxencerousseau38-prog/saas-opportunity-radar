// Pure helpers for the filter panel: active-filter chips and their removal
// (PRD §4.3 "retirer une condition sans réinitialiser les autres").
import type { CatalogFilters, ResearchPreferences } from "@sor/contracts";
import {
  AGE_BUCKETS,
  ACQUISITION_CHANNEL,
  ACQUISITION_CHANNEL_STATUS,
  BILLING_MODEL,
  COMMERCIAL_VALIDATION,
  COMPANY_PROFILE,
  CONFIGURABLE_EXCLUSIONS,
  CUSTOMER_TYPE,
  PRICE_BANDS,
  countryName,
} from "@/lib/labels";

export interface Chip {
  key: string;
  label: string;
  remove: (f: CatalogFilters) => CatalogFilters;
}

const without = <T>(list: T[], value: T) => list.filter((v) => v !== value);

export function activeChips(f: CatalogFilters, categoryName: (slug: string) => string): Chip[] {
  const chips: Chip[] = [];
  const unknownChip = (group: string, label: string, remove: Chip["remove"]) =>
    chips.push({ key: `${group}:unknown`, label: `${label} : inconnus inclus`, remove });

  f.customer_types?.values.forEach((v) =>
    chips.push({
      key: `ct:${v}`,
      label: CUSTOMER_TYPE[v] ?? v,
      remove: (x) => ({
        ...x,
        customer_types: x.customer_types && {
          ...x.customer_types,
          values: without(x.customer_types.values, v),
        },
      }),
    }),
  );
  if (f.customer_types?.include_unknown)
    unknownChip("ct", "Clientèle", (x) => ({
      ...x,
      customer_types: x.customer_types && { ...x.customer_types, include_unknown: false },
    }));

  f.team_size?.presets.forEach((v) =>
    chips.push({
      key: `team:${v}`,
      label: `Équipe ${v}`,
      remove: (x) => ({
        ...x,
        team_size: x.team_size && { ...x.team_size, presets: without(x.team_size.presets, v) },
      }),
    }),
  );
  if (f.team_size?.custom)
    chips.push({
      key: "team:custom",
      label: `Équipe ${f.team_size.custom.min ?? 0}–${f.team_size.custom.max ?? "∞"}`,
      remove: (x) => ({ ...x, team_size: x.team_size && { ...x.team_size, custom: undefined } }),
    });
  if (f.team_size?.include_unknown)
    unknownChip("team", "Équipe", (x) => ({
      ...x,
      team_size: x.team_size && { ...x.team_size, include_unknown: false },
    }));

  f.hq_countries?.values.forEach((v) =>
    chips.push({
      key: `hq:${v}`,
      label: `Siège : ${countryName(v)}`,
      remove: (x) => ({
        ...x,
        hq_countries: x.hq_countries && {
          ...x.hq_countries,
          values: without(x.hq_countries.values, v),
        },
      }),
    }),
  );
  if (f.hq_countries?.include_unknown)
    unknownChip("hq", "Pays", (x) => ({
      ...x,
      hq_countries: x.hq_countries && { ...x.hq_countries, include_unknown: false },
    }));

  f.age?.buckets.forEach((v) =>
    chips.push({
      key: `age:${v}`,
      label: AGE_BUCKETS[v] ?? v,
      remove: (x) => ({ ...x, age: x.age && { ...x.age, buckets: without(x.age.buckets, v) } }),
    }),
  );
  if (f.age?.include_unknown)
    unknownChip("age", "Ancienneté", (x) => ({
      ...x,
      age: x.age && { ...x.age, include_unknown: false },
    }));

  f.categories?.slugs.forEach((v) =>
    chips.push({
      key: `cat:${v}`,
      label: categoryName(v),
      remove: (x) => {
        const slugs = without(x.categories?.slugs ?? [], v);
        return { ...x, categories: slugs.length ? { slugs } : undefined };
      },
    }),
  );

  f.billing_models?.values.forEach((v) =>
    chips.push({
      key: `bm:${v}`,
      label: BILLING_MODEL[v] ?? v,
      remove: (x) => ({
        ...x,
        billing_models: x.billing_models && {
          ...x.billing_models,
          values: without(x.billing_models.values, v),
        },
      }),
    }),
  );
  if (f.billing_models?.include_unknown)
    unknownChip("bm", "Modèle", (x) => ({
      ...x,
      billing_models: x.billing_models && { ...x.billing_models, include_unknown: false },
    }));

  f.price_bands?.values.forEach((v) =>
    chips.push({
      key: `price:${v}`,
      label: PRICE_BANDS[v] ?? v,
      remove: (x) => ({
        ...x,
        price_bands: x.price_bands && {
          ...x.price_bands,
          values: without(x.price_bands.values, v),
        },
      }),
    }),
  );
  if (f.price_bands?.include_unknown)
    unknownChip("price", "Prix", (x) => ({
      ...x,
      price_bands: x.price_bands && { ...x.price_bands, include_unknown: false },
    }));

  f.commercial_validation?.forEach((v) =>
    chips.push({
      key: `cv:${v}`,
      label: COMMERCIAL_VALIDATION[v] ?? v,
      remove: (x) => ({ ...x, commercial_validation: without(x.commercial_validation ?? [], v) }),
    }),
  );

  f.company_profile?.values.forEach((v) =>
    chips.push({
      key: `cp:${v}`,
      label: COMPANY_PROFILE[v] ?? v,
      remove: (x) => ({
        ...x,
        company_profile: x.company_profile && {
          ...x.company_profile,
          values: without(x.company_profile.values, v),
        },
      }),
    }),
  );
  if (f.company_profile?.include_unknown)
    unknownChip("cp", "Profil", (x) => ({
      ...x,
      company_profile: x.company_profile && { ...x.company_profile, include_unknown: false },
    }));

  f.acquisition_channels?.values.forEach((v) =>
    chips.push({
      key: `acq:${v}`,
      label: `Acquisition · ${ACQUISITION_CHANNEL[v] ?? v}`,
      remove: (x) => ({
        ...x,
        acquisition_channels: x.acquisition_channels && {
          ...x.acquisition_channels,
          values: without(x.acquisition_channels.values, v),
        },
      }),
    }),
  );
  f.acquisition_channels?.statuses.forEach((v) =>
    chips.push({
      key: `acq-status:${v}`,
      label: `Canal · ${ACQUISITION_CHANNEL_STATUS[v] ?? v}`,
      remove: (x) => ({
        ...x,
        acquisition_channels: x.acquisition_channels && {
          ...x.acquisition_channels,
          statuses: without(x.acquisition_channels.statuses, v),
        },
      }),
    }),
  );
  if (f.acquisition_channels?.include_unknown)
    unknownChip("acq", "Acquisition Channels", (x) => ({
      ...x,
      acquisition_channels: x.acquisition_channels && {
        ...x.acquisition_channels,
        include_unknown: false,
      },
    }));

  f.configurable_exclusions.forEach((v) =>
    chips.push({
      key: `ex:${v}`,
      label: `Exclure : ${CONFIGURABLE_EXCLUSIONS[v] ?? v}`,
      remove: (x) => ({ ...x, configurable_exclusions: without(x.configurable_exclusions, v) }),
    }),
  );
  if (f.include_hidden)
    chips.push({
      key: "hidden",
      label: "SaaS masqués inclus",
      remove: (x) => ({ ...x, include_hidden: false }),
    });
  return chips;
}

/** PRD §14.1 / §21 research preferences expressed as catalog filters. */
export function filtersFromPreferences(
  p: ResearchPreferences,
  base: CatalogFilters,
): CatalogFilters {
  const presets =
    p.team_size_max === null
      ? []
      : p.team_size_max <= 5
        ? (["1-5"] as const)
        : p.team_size_max <= 10
          ? (["1-10"] as const)
          : p.team_size_max <= 20
            ? (["1-20"] as const)
            : [];
  return {
    ...base,
    customer_types: p.customer_types.length
      ? { values: p.customer_types, include_unknown: true }
      : base.customer_types,
    hq_countries: p.priority_countries.length
      ? { values: p.priority_countries, include_unknown: true }
      : base.hq_countries,
    team_size: presets.length ? { presets: [...presets], include_unknown: true } : base.team_size,
    categories: p.priority_category_slugs.length
      ? { slugs: p.priority_category_slugs }
      : base.categories,
    billing_models: p.billing_models.length
      ? { values: p.billing_models, include_unknown: true }
      : base.billing_models,
    configurable_exclusions: [
      ...new Set([...base.configurable_exclusions, ...p.configurable_exclusions]),
    ],
  };
}
