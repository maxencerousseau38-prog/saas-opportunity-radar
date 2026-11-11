# ADR-016 — Visuels produits et Heroes de Discover

- **Statut :** ACCEPTED (PD-36, orientation approuvée au lancement de S8.3 le 11 novembre 2026)
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

