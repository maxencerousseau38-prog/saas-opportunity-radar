# ADR-017 — Taxonomie et preuves des Acquisition Channels

- **Statut :** ACCEPTED (PD-37, orientation approuvée au lancement de S8.3 le 11 novembre 2026)
- **Date :** 11 novembre 2026
- **Références :** PRD §§24.3, 24.4 et 24.5 ; migration `20261115090001_discover_v2_assets_and_acquisition_channels.sql` ; tables `product_acquisition_channels` et `evidence_items`.

## Contexte

SOR possède déjà le stockage, les statuts, les preuves, l'affichage et le filtre des Acquisition Channels. Les valeurs doivent décrire les canaux qu'un SaaS du catalogue utilise réellement pour acquérir ses clients. Elles ne décrivent ni les sources qui alimentent le catalogue SOR, ni les recommandations Go-to-Market d'une opportunité future.

## Décision

### 1. Taxonomie de catégories

Conserver les huit catégories de haut niveau déjà présentes dans la base :

- `organic` — organique ;
- `community` — communauté ;
- `content_search` — contenu et recherche ;
- `social` — réseaux sociaux ;
- `partnership` — partenariats ;
- `paid` — acquisition payante ;
- `other` — autre ;
- `unknown` — inconnu.

Les canaux précis sont représentés par des clés canoniques (par exemple SEO, X, Reddit ou LinkedIn). Les variantes d'écriture et synonymes doivent être normalisés vers une clé canonique documentée et testée. L'ajout d'une nouvelle clé nécessite une mise à jour du registre et de ses tests. Ne pas créer de valeurs arbitraires à partir de texte libre.

Une plateforme peut être un canal d'acquisition pour un SaaS sans être une source de données autorisée pour SOR. En particulier, la présence de Product Hunt, Reddit, X ou LinkedIn dans cette taxonomie n'autorise aucun connecteur, collecte automatisée ou usage de leur API.

### 2. Statuts factuels

Les quatre statuts du PRD sont conservés :

- `confirmed` : preuve directe, consultable et vérifiable ;
- `declared` : déclaration attribuable à l'entreprise ou à un représentant identifiable, sans vérification indépendante équivalente ;
- `estimated` : inférence explicitement signalée, avec méthode et indices documentés ;
- `unknown` : aucune conclusion fiable disponible.

Une absence de preuve ne signifie jamais que le SaaS n'utilise pas un canal. Les fiches et filtres doivent préserver la distinction entre inconnu et absence observée.

### 3. Canal principal et canaux secondaires

- Un canal est `primary` uniquement si une preuve indique explicitement qu'il s'agit du canal principal ou dominant.
- Un canal observé sans preuve de primauté est `secondary`.
- Une inférence ne devient pas un fait confirmé. Une estimation du canal dominant doit rester explicitement `estimated` et exposer sa méthode.
- Ne pas inventer un canal principal pour remplir le champ. Si aucune preuve ne permet de choisir, utiliser un état inconnu plutôt qu'une supposition.

### 4. Preuves et confiance

Chaque canal non inconnu conserve une preuve rattachée au bon produit, une source consultable, une date d'observation, son statut et une justification. Le niveau de confiance reste distinct du statut factuel et doit être explicable par la qualité, la directivité, l'indépendance et la fraîcheur des éléments disponibles.

Aucun score de confiance ne doit être inventé ou dérivé d'une simple absence de données. S8.3 doit définir une méthode déterministe documentée, la tester sur des exemples positifs, négatifs et ambigus, et afficher les raisons utiles à l'opérateur.

### 5. Collecte et limites d'autorisation

- Commencer avec les preuves déjà disponibles et des déclarations explicitement fournies ou vérifiées.
- Toute nouvelle source, API, méthode de collecte ou conservation de contenu fait l'objet d'une revue écrite de ses conditions et d'une approbation préalable selon ADR-013.
- Pas d'activation de connecteur X, Reddit, LinkedIn, Product Hunt ou autre par cet ADR.
- Aucun contenu synthétique ou résultat simulé ne peut être compté comme une preuve réelle.
- Les Acquisition Channels restent séparés des Discovery Sources et des recommandations Go-to-Market.

## Conséquences

- La couverture des canaux peut rester faible ou inconnue au début ; ne pas fabriquer une couverture artificielle.
- Les filtres doivent fonctionner par clé canonique et statut, sans perdre les preuves ou les inconnus.
- Les fiches Feed, Grid et List exposent un lien de source, la date, le statut et une confiance justifiée lorsque disponible.

## Critères d'acceptation

1. Les huit catégories sont stables et les clés précises sont normalisées.
2. Les statuts `confirmed`, `declared`, `estimated` et `unknown` restent distincts partout.
3. Un canal `confirmed` référence une preuve vérifiée et consultable.
4. Un canal `primary` a une preuve de primauté ; sinon il reste secondaire ou inconnu.
5. Le niveau de confiance est distinct du statut et explicable.
6. Les filtres, recherches sauvegardées et tris conservent statut et provenance.
7. Aucun nouveau connecteur ou coût n'est introduit sans décision distincte.

