# Indice UV

Cette intégration suit l'**indice UV** des lieux de votre choix. Vous ajoutez vos
**maisons Gladys en un clic** ou un lieu avec son **code postal**, et un appareil
apparaît dans l'onglet **Découverte**, prêt à être ajouté à Gladys.

Aucun compte à créer, aucune clé d'API à saisir : les deux sources utilisées sont
des données ouvertes publiques.

## Ajouter vos maisons Gladys, en un clic

Vous avez déjà dit à Gladys où vous habitez : c'est la carte de **Réglages >
Maisons**. Le bouton **« Ajouter mes maisons Gladys »** lit ces maisons et crée
un lieu pour chacune qui n'est pas déjà surveillée — aucun code postal à saisir.

Trois choses à savoir :

- **L'accès est une autorisation.** L'endroit où vous vivez est une donnée
  personnelle : Gladys ne la partage que si vous l'avez accepté sur l'écran
  d'installation de l'intégration. Si le bouton répond que l'accès est refusé,
  supprimez puis réinstallez l'intégration en acceptant la demande affichée.
- **Une maison sans position sur la carte n'a pas de coordonnées.** Elle est
  nommée dans la réponse, et il suffit de la placer dans Réglages > Maisons puis
  de relancer l'action.
- **Ce n'est pas une synchronisation.** Les maisons sont lues au moment du clic.
  Le lieu obtenu est un lieu ordinaire, que vous renommez et supprimez comme les
  autres, et une maison déplacée dans Gladys ensuite ne déplace pas son lieu.

Relancer l'action est sans risque : une maison déjà surveillée est signalée, pas
ajoutée une deuxième fois.

## Ajouter un lieu

Dans l'écran de configuration de l'intégration, cliquez sur **« Ajouter un
lieu »** et remplissez le formulaire :

- **Nom du lieu** — facultatif. Laissé vide, le nom de la commune trouvée est
  utilisé (« Nantes »).
- **Code postal** — cinq chiffres, par exemple `44300`. C'est la voie normale.
- **Commune** — facultatif, et utile seulement quand un code postal couvre
  plusieurs communes. `01000` désigne à la fois Bourg-en-Bresse, Péronnas et
  Saint-Denis-lès-Bourg : lancez d'abord l'action sans ce champ, la réponse
  affichée sous le bouton liste les communes possibles, puis relancez-la en
  recopiant celle que vous visez.
- **Latitude / Longitude** — facultatif. Renseignées toutes les deux, elles sont
  utilisées telles quelles et le code postal ne sert plus que de libellé.

Le message affiché sous le bouton confirme ce qui a été ajouté, avec la commune
retenue et son point. **L'appareil n'est pas créé automatiquement** : allez le
chercher dans l'onglet **Découverte** de l'intégration et ajoutez-le.

### Un lieu hors de France

Le code postal est français par construction — c'est le registre de l'État qui le
résout. Les données UV, elles, sont mondiales : pour un lieu à l'étranger,
laissez le code postal vide et renseignez la **latitude** et la **longitude** en
degrés décimaux WGS-84. La virgule décimale est acceptée (`48,8566`).

## Voir et supprimer vos lieux

- **« Afficher mes lieux »** liste tout ce qui est configuré, numéroté. Chaque
  entrée commence par un « • » suivi de son numéro.
- **« Supprimer un lieu »** demande ce numéro — celui qu'affiche la liste — puis
  une confirmation. Lancez l'action une première fois **sans cocher** la case
  pour vérifier quel lieu serait supprimé.

Deux choses à savoir sur la suppression :

1. **L'appareil Gladys n'est pas supprimé.** Une intégration n'a pas le droit de
   supprimer un appareil : elle peut seulement cesser de le proposer. Le lieu
   disparaît de la Découverte et l'appareil cesse de se mettre à jour ;
   supprimez-le vous-même depuis l'onglet **Appareils** de l'intégration si vous
   n'en voulez plus. Le message de suppression vous le rappelle en le nommant.
2. **Les numéros suivants remontent d'un rang.** Si vous supprimez le lieu 2 sur
   4, l'ancien lieu 3 devient le lieu 2. Relancez « Afficher mes lieux » avant
   d'en supprimer un autre.

## Ce que mesure chaque appareil

| Fonctionnalité                 | Ce que c'est                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Indice UV                      | L'indice actuel, en nombre entier                                                        |
| Indice UV max du jour          | Le pic de la journée — le chiffre autour duquel on organise un après-midi                |
| Indice UV (ciel clair)         | Ce qu'il vaudrait sans nuages ; l'écart avec l'indice réel, c'est la couverture nuageuse |
| Niveau d'exposition UV         | De 0 à 5, les catégories de l'OMS : la fonctionnalité à tester dans un scénario          |
| Niveau d'exposition UV (texte) | Son libellé : « Faible », « Élevé »…                                                     |
| Conseil de protection solaire  | La recommandation de l'OMS pour ce niveau                                                |

### L'échelle

L'**indice UV universel** est défini par l'OMS, l'OMM, le PNUE et l'ICNIRP. Il
est ouvert vers le haut, s'exprime en nombre entier, et se lit par catégories :

| Indice UV | Niveau publié | Libellé    | Protection                                              |
| --------- | ------------- | ---------- | ------------------------------------------------------- |
| 0         | 0             | Nul        | Aucune : pas de rayonnement                             |
| 1–2       | 1             | Faible     | Aucune protection nécessaire                            |
| 3–5       | 2             | Modéré     | Ombre à la mi-journée, chapeau, lunettes, crème solaire |
| 6–7       | 3             | Élevé      | Évitez le soleil entre 12h et 16h                       |
| 8–10      | 4             | Très élevé | Évitez de sortir entre 12h et 16h, vêtements couvrants  |
| 11+       | 5             | Extrême    | La peau non protégée brûle en quelques minutes          |

Le niveau **0** est un ajout de cette intégration : la catégorie la plus basse de
l'OMS, « faible », va de 0 à 2, mais « il n'y a aucun UV en ce moment » mérite sa
propre valeur dans une maison — c'est ce sur quoi un scénario se déclenche à la
tombée du jour.

### Une valeur manquante n'est jamais un zéro

Quand le modèle n'a pas de valeur pour un lieu, **rien n'est publié** pour la
fonctionnalité concernée : l'appareil garde sa dernière valeur connue. Publier un
0 ferait croire à un coucher de soleil en plein après-midi et déclencherait les
scénarios correspondants.

## Réglages généraux

- **Langue du nom des appareils** — le reste de ce que dit l'intégration suit
  déjà la langue de votre compte Gladys, mais le nom d'un appareil et de ses
  fonctionnalités est enregistré tel quel au moment où vous créez l'appareil.
  Un appareil déjà ajouté **conserve** les noms avec lesquels il a été créé :
  changez la langue, puis supprimez et rajoutez l'appareil depuis la Découverte
  pour le renommer.
- **Intervalle de rafraîchissement** — 30 minutes par défaut, entre 10 minutes et
  6 heures. La prévision CAMS est horaire : descendre nettement sous la
  demi-heure n'apporte rien de plus.

## Vérifier que tout fonctionne

Le bouton **« Tester le fournisseur UV »** interroge la source en direct pour
chaque lieu et affiche l'indice obtenu, au même format numéroté que la liste des
lieux. Si un lieu échoue, sa ligne dit pourquoi et les autres répondent quand
même.

L'écran de supervision affiche également l'état de l'intégration : tant qu'aucun
lieu n'est configuré, il indique qu'il faut en ajouter un.

## D'où viennent les données

- **L'indice UV** : le service européen [Copernicus
  CAMS](https://atmosphere.copernicus.eu/), qui calcule la dose UV
  biologiquement efficace à partir de l'ozone total, des aérosols et de la
  nébulosité. Sa prévision est rediffusée en données ouvertes par
  [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CC BY 4.0), sans
  compte ni clé. Couverture mondiale, résolution horaire, grille d'environ 45 km.
- **Les codes postaux** : l'[API Découpage
  administratif](https://geo.api.gouv.fr/decoupage-administratif/communes) de
  l'État français, publiée sur data.gouv.fr à partir de la base administrative de
  l'INSEE. Elle donne les communes couvertes par un code postal et leur centre.

Météo-France publie aussi une prévision d'indice UV, mais son portail exige un
compte et un jeton applicatif que chaque utilisateur devrait créer avant que
l'intégration n'affiche quoi que ce soit. Copernicus est tout aussi officiel et
ne demande rien.
