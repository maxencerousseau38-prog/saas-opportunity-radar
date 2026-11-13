# ADR-016 — Visuels produits et Heroes de Discover

- **Statut :** ACCEPTED (PD-36, orientation approuvée au lancement de S8.3 le 11 novembre 2026 ; amendée par PD-38 et PD-40)
- **Date :** 11 novembre 2026
- **Décision produit :** les cartes Discover peuvent présenter de vrais visuels produits uniquement lorsque leur provenance et les droits correspondant au mode d'utilisation sont établis.
- **Références :** PRD §§24.2, 24.4 et 24.5 ; migration `20261115090001_discover_v2_assets_and_acquisition_channels.sql` ; table `product_visual_assets`.

## Contexte

Le modèle de données, le contrôle d'accès et l'affichage conditionnel des visuels existent déjà. La table `product_visual_assets` conserve notamment le type, l'URL source, le chemin de livraison, le hash, le texte alternatif, la base de droits, le statut des droits, la vérification et le lien vers une preuve. La carte Discover affiche l'actif uniquement lorsque celui-ci est approuvé, vérifié et livrable.

En revanche, le dépôt ne contient pas encore de mécanisme opérationnel qui acquiert, contrôle, enregistre, livre et retire ces actifs. Le nombre d'actifs réellement disponibles ne doit jamais être gonflé par des placeholders présentés comme authentiques.

## Décision

### 1. Types d'actifs autorisés pour la V1 de S8.3

Les seuls types pris en charge restent les trois valeurs déjà prévues :

- `official_hero` : visuel de présentation officiel du produit ;
- `product_screenshot` : capture authentique de l'interface du produit ;
- `official_illustration` : illustration officielle du produit, explicitement étiquetée comme illustration.

S8.3 ne crée pas de nouveau type vidéo ou animation. Une illustration ne doit jamais être présentée comme une capture d'interface.

### 2. Authenticité et provenance

- Un actif doit provenir du site officiel du produit ou d'une source identifiable qui dispose du droit de le fournir.
- Chaque actif conserve son URL source, sa date d'observation, son type, son hash, son texte alternatif, sa preuve associée et une base de droits compréhensible et vérifiable.
- Un logo seul ne devient pas un Hero.
- Aucun visuel généré, reconstitué ou synthétique ne peut être présenté comme un visuel authentique du produit.
- Aucune page privée, session, cookie, compte authentifié ou zone protégée ne peut être utilisée pour obtenir une capture.

### 3. Droits d'utilisation

L'accessibilité publique d'une image ou sa présence sur le site officiel ne suffit pas, à elle seule, à établir les droits de copie, de stockage, de mise en cache ou d'intégration.

Le statut `approved` n'est accordé que si la base de droits couvre explicitement le mode de livraison choisi :

- copie et stockage privés, uniquement lorsque la licence ou l'autorisation couvre la reproduction et le stockage ;
- intégration distante sans copie, uniquement lorsque les conditions autorisent explicitement l'intégration ou l'affichage distant.

Si les droits sont inconnus, ambigus, restreints ou retirés, l'actif n'est pas affiché. Ne pas contourner cette règle par du hotlinking, du cache ou un proxy. Une autorisation de consulter une page ne vaut pas autorisation de réutiliser son image.

### 4. Sécurité d'acquisition et de livraison

- Toute récupération réseau d'une URL externe passe par les contrôles de sécurité existants : validation HTTPS, SSRF, DNS, redirections réévaluées, limites de taille et de type MIME, délais et contrôle des destinations.
- Aucun téléchargement arbitraire à partir d'une URL fournie sans validation.
- Les actifs copiés avec des droits de stockage sont placés dans un stockage privé, jamais dans un bucket public par défaut.
- L'accès de livraison suit les permissions de SOR et ne révèle pas de secret ou d'URL de stockage durable.
- Le processus doit permettre la revalidation, le retrait et la suppression d'un actif lorsque les droits changent ou qu'une demande de retrait est reçue.

### 5. Règles d'affichage

- Seuls les actifs `rights_status = 'approved'` et `verification_status = 'verified'`, liés à une preuve visible, peuvent être exposés.
- L'aperçu ouvre le site officiel du produit ; la source du visuel reste consultable.
- L'affichage actuel 16:7 est conservé pour le cadrage initial, sans déformer l'image source.
- En l'absence d'actif autorisé, utiliser le fallback honnête existant : logo, nom, catégorie, description réelle et lien officiel. Aucun espace vide ni faux aperçu ne doit suggérer qu'une capture existe.

### 6. Acquisition initiale et périmètre

S8.3 peut commencer par une acquisition contrôlée et limitée aux actifs dont les droits sont documentés. Aucun nouveau connecteur, fournisseur payant, service tiers, source de scraping ou budget n'est autorisé par cet ADR. Une source de visuels ou une méthode de collecte automatisée exige une revue de ses conditions et une approbation distincte lorsqu'elle constitue une nouvelle source.

## Conséquences

- Le volume de visuels peut rester faible tant que les droits ne sont pas démontrés ; c'est un résultat acceptable et préférable à des actifs non autorisés.
- L'implémentation doit réutiliser `product_visual_assets` et son modèle evidence-first. Toute migration supplémentaire doit être justifiée par un écart démontré.
- La méthode précise d'ingestion, la livraison privée et la procédure opérationnelle de retrait doivent être validées par des tests avant de remplir le catalogue.

## Critères d'acceptation

1. Un actif sans droits documentés ne peut pas apparaître dans Discover.
2. Un actif approuvé est authentique, vérifié, relié à une preuve et attribué.
3. Les types Hero, capture et illustration sont identifiés sans confusion.
4. Les requêtes réseau sont protégées contre SSRF, redirections et contenus surdimensionnés ou non-images.
5. Un retrait invalide immédiatement l'actif en affichage.
6. Le fallback reste correct et utilisable dans Feed, Grid et List.
7. Des tests couvrent un cas positif autorisé, les cas refusés et l'absence d'actif.

## Implémentation (S8.3, 11 novembre 2026)

- **Mode de livraison retenu : copie privée uniquement.** L’intégration distante (hotlink) n’est pas implémentée : aucune autorisation explicite d’intégration n’a été documentée. Le contrat Discover n’accepte que le chemin de livraison SOR `/api/v1/catalog/assets/<id>`.
- **Stockage privé sans nouveau service :** table serveur `product_visual_asset_files` (RLS activée, aucun droit navigateur, PNG/JPEG/WebP, 2 Mo maximum). Supabase Storage n’est pas requis ; le volume attendu est faible.
- **Admission contrôlée :** commande worker `pnpm --filter @sor/worker assets:build` puis `node dist-assets/assets.js admit <manifeste>` (`visual-assets-1`). Les droits sont vérifiés **avant toute requête réseau** (`checkVisualAssetRights`, `@sor/domain`) : statut `approved`, base de droits, URL https de la preuve des droits et couverture explicite de la copie privée. Puis récupération par le fetcher SSRF-safe existant (adresses publiques, redirections revalidées, robots.txt, type MIME, taille, délai ; https obligatoire), contrôle des octets (format reconnu par ses en-têtes, SVG refusé, dimensions minimales, forme de logo refusée) et RPC auditée `sor_admit_visual_asset` (opérateur vérifié, hash recalculé, preuve `visual_asset` vérifiée liée au produit, rejouable).
- **Livraison :** route `GET /api/v1/catalog/assets/[assetId]` ; la lecture RLS de l’utilisateur doit d’abord renvoyer l’actif (courant, approuvé, vérifié, produit et preuve visibles), puis le serveur lit les octets. En-têtes `private`, `nosniff`, `default-src 'none'; sandbox`. Jamais de redirection vers la source.
- **Retrait et revalidation :** la console opérateur retire un visuel avec un motif (`sor_operator_remove_visual_asset` : masqué immédiatement, copie supprimée, journalisé). `assets.js revalidate` retélécharge chaque visuel affiché : identique, il reste ; modifié, disparu ou refusé, il est masqué et sa copie supprimée (`sor_record_visual_asset_check`) ; une erreur transitoire ne change rien.
- **Correctif :** le trigger `check_product_discover_evidence` de la migration `20261115090001` lisait `NEW.fact_status` sur `product_visual_assets`, qui n’a pas cette colonne : aucun visuel n’était insérable. Corrigé dans `20261123090001_discover_v2_completion.sql`.
- **Couverture réelle :** aucun visuel réel n’a été admis par S8.3 (aucun droit documenté à ce jour). Les tests utilisent des images synthétiques étiquetées. Le repli honnête reste l’état par défaut.

## Amendement PD-38 (S8.5, 12 novembre 2026) : visuels par référence

Décision du product owner (PD-38) : des visuels **automatiques** pour le
catalogue, en plus des copies privées admises une par une. Deux nouveaux
types, **affichés par référence** depuis leur origine (aucune copie stockée :
la base de l'offre gratuite, 500 Mo, ne peut pas contenir des milliers
d'images, et rien n'est reproduit par SOR) :

1. **`licensed_image` — image sous licence libre.** L'image Wikidata (P18)
   d'une annonce, hébergée sur Wikimedia Commons. Seules les licences CC0,
   domaine public, CC BY et CC BY-SA sont acceptées (NC, ND, GFDL seule,
   usage loyal : refusés). La licence, son lien, l'auteur et la page du
   fichier sont lus dans l'API officielle de Commons et affichés avec
   l'image (obligation d'attribution). Formats raster seulement (SVG
   refusé : les logos y sont presque toujours), image large (≥ 500×280,
   ratio ≥ 1), nom de fichier qui n'évoque pas un logo ou une icône.
2. **`publisher_share_image` — image de partage de l'éditeur.** L'image
   `og:image` / `twitter:image` que l'éditeur déclare sur **son propre site
   officiel** pour les aperçus de liens. **Ce n'est pas une licence** : le
   libellé le dit (« Image de partage publiée par l'éditeur », sans licence
   vérifiée). Page lue par le connecteur `official_website` (robots.txt,
   fetcher SSRF-safe, redirections limitées au même site) ; image
   téléchargée une fois par le fetcher d'images (robots.txt de l'hôte de
   l'image, https, PNG/JPEG/WebP, 5 Mo) pour vérifier qu'elle est réelle et
   large (≥ 600×300, ratio ≥ 1,2, pas de logo) et la hacher, puis oubliée.
   La page doit être sur le domaine du produit ou un sous-domaine. Une URL d'image signée ou porteuse d'un jeton (S3/GCS présignée, jeton Firebase, JWT) est refusée : elle expire et contient des identifiants.

Ce que l'amendement **ne change pas** : les copies privées restent soumises
au §3 (droits documentés couvrant la copie, opérateur, preuve vérifiée) ;
aucune capture d'écran automatique, aucune image générée, aucune page privée ;
le retrait par l'opérateur masque immédiatement une référence. Le §3 interdisait
le hotlink faute d'autorisation explicite : PD-38 l'autorise pour ces deux
types uniquement, chacun avec ses règles et son libellé.

**Préséance sur une carte :** copie approuvée > licence libre > image de
partage. **Navigateur :** l'image est chargée depuis son origine sans
référent (`referrerpolicy="no-referrer"`) ; si elle ne se charge plus, la
carte revient au repli honnête (« Aperçu authentique non disponible »).

**Implémentation :** migration `20261125090001_visual_references.sql`
(source `wikimedia_commons`, types, statuts `licensed` /
`publisher_published`, mode `external_reference`, colonnes licence /
attribution, règles par type, RPC `sor_record_visual_reference`, politique de
lecture, DTO Discover), règles `visref-1` (`@sor/domain`), collecteurs
`@sor/data-sources` (`connectors/commons.ts`, `share-image.ts`), CLI
`visuals.js collect|ingest` (worker), workflow *Catalog visuals* (collecte sur
GitHub, instantanés `data/visuals/*.json` validés), cartes et profil (type,
crédit, licence, repli). Sprint : `docs/sprints/S8.5-VISUAL-REFERENCES.md`.


## Amendement PD-40 (13 novembre 2026) : visuels du site officiel, règles `visref-2`

Demande du product owner : que chaque SaaS soit représenté par son véritable
univers visuel, dans cet ordre : (1) le visuel principal (hero) de son site
officiel, (2) une capture authentique de son interface, (3) l'image Open Graph
en solution secondaire ; jamais d'image aléatoire, générique ou sans rapport.

**Deux nouveaux types de référence**, collectés dans la **même visite** de la
page d'accueil officielle que l'image de partage (robots.txt, fetcher
SSRF-safe, redirections limitées au même site) :

- `official_hero` (référence) : le visuel principal que la page montre ;
- `product_screenshot` (référence) : une capture de l'interface que la page montre.

**Sélection déterministe** (`@sor/data-sources/site-images.ts`) : une image
n'est candidate qu'avec un **signal explicite** — nom de fichier, texte
alternatif ou identifiant qui dit « hero / bannière / visuel principal » ou
« capture / dashboard / interface / aperçu / démo », ou une section dont la
classe est `hero` ou `banner`. Sont exclus d'office : logos, icônes, avatars,
portraits, équipes, témoignages, badges et récompenses, boutons de stores,
décorations (motifs, dégradés, fonds), illustrations, images de blog, cartes,
images « stock », SVG/GIF, images de widgets tiers (Product Hunt, G2,
Trustpilot, avatars Google/GitHub/Twitter…) et images déclarées petites. Au
plus trois candidats par page sont téléchargés, une fois, pour vérification.

**Règles de qualité `visref-2`** (`@sor/domain`), pour tous les types :
dimensions minimales (hero ≥ 1000×420, capture ≥ 800×400), forme (ni carrée
ni bandeau extrême), **détail** (une image presque vide — couleur unie, petit
logo sur fond uni — est refusée d'après son poids par pixel), **aperçus par
défaut des plateformes** refusés (Lovable, Softr, Chrome Web Store, cartes
d'icône de l'App Store), **banques d'images** refusées (Unsplash, Pexels,
Shutterstock…), et **image partagée** : une image trouvée sur les sites de deux
produits différents est un modèle, retirée pour les deux.

**Préséance unique** (`private.visual_rank`) : copie approuvée > hero du site >
capture du site > image sous licence libre > image de partage. Le visuel
principal est toujours le meilleur visuel courant
(`private.refresh_primary_visual`), y compris après un retrait : le suivant
prend le relais immédiatement.

**Retrait des images génériques déjà chargées** :
`sor_retire_generic_visual_references()` (service, audité, rejouable) — même
image sur plusieurs produits, aperçus par défaut, banques d'images. Les
références retirées restent dans l'historique avec leur motif.

**Ce que l'amendement ne change pas** : aucune copie stockée, aucune capture
automatique (pas de navigateur), aucune image générée, aucune page privée ;
libellé honnête (« Visuel officiel », « Capture du produit »), source et note
de droits visibles ; retrait opérateur immédiat. Migration
`20261126090001_site_visual_references.sql`, pgTAP 029. Sprint :
`docs/sprints/S8.6-SITE-VISUALS.md`.
