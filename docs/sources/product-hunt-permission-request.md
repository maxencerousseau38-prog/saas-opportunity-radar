# Demande d'autorisation à Product Hunt — brouillon (NON ENVOYÉ)

**Statut :** brouillon préparé le 6 novembre 2026 à la demande du product
owner. **Il n'a pas été envoyé.** C'est le product owner qui l'envoie,
depuis sa propre adresse, à `hello@producthunt.com` (adresse indiquée par
des résumés de la documentation de l'API ; à confirmer sur
`https://www.producthunt.com/v2/docs` avant l'envoi).

Points à compléter avant l'envoi : `[Nom]`, `[Pays]`, et éventuellement le
nom de l'application déclarée dans le tableau de bord API.

Rien n'est construit pour Product Hunt avant une réponse écrite et
l'approbation du product owner (voir `docs/DATA_SOURCES.md`).

---

**Objet :** API v2 access request — personal, read-only research tool

Hello Product Hunt team,

I am building a personal research tool, used only by me, to study existing
B2B SaaS products: what they do, how they are priced and where their
customers are underserved. I would like to use the Product Hunt API v2 to
find recently launched SaaS products, and I am writing to ask whether my
use is allowed and under which conditions.

How I would use the API:

- **Read-only.** Public launch data only: post id, product name, tagline,
  topics, launch date, vote and comment counts, and the product's website
  link. No write access, no user context.
- **No personal data.** I would not request or store maker or user
  profiles, comments or e-mail addresses.
- **Low volume.** A few searches per week, started manually, well under
  the published rate limits (at most a few hundred requests per day).
- **Limited storage.** I would keep only the fields above, plus a link
  back to the Product Hunt post as the source. Product details would come
  from each product's own website, not from Product Hunt.
- **No redistribution.** Nothing is published, resold, or exposed in a
  public product or API, and the data is not used to train AI models.

Purpose: the research supports my own decisions about which software
products to study and possibly build. I mention this so you can tell me
whether it counts as commercial use under your API terms.

My questions:

1. Is this use allowed under the default API terms, or does it need your
   written permission or a commercial agreement?
2. Are there attribution requirements, or limits on how long I may keep
   the fields listed above?
3. Is a developer token or a client-credentials token the right access
   method for this use?

Thank you for your time. I am happy to give more details.

Best regards,
[Nom]
[Pays]
