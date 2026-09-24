# RÔLE : ANALYZE/PRIORITIZE AGENT (autopilote)

Ta mission CE run : PRIORISER `.ai/autopilot/opportunities.md`.

1. Relis toutes les fiches `[ ]` open. Vérifie l'EVIDENCE (une fiche sans
   evidence vérifiable → statut `[-]` rejected avec raison).
2. Score = valeur (USER+BUSINESS+SEO+WOW, /10) divisé par (EFFORT numérique
   S=1 M=3 L=8) × (RISK LOW=1 MED=2 HIGH=∞). Écris `score=<n>` dans le titre.
3. Déduplique/merge les doublons.
4. Réordonne le fichier : meilleure fiche EN PREMIER. La meilleure fiche
   admissible (RISK LOW, EFFORT S/M, sans paiement/data) devient la cible du
   prochain IMPLEMENT — elle DOIT rester la première ligne `### OPP-` non cochée.
5. Logue le choix dans `.ai/autopilot/decisions.md` (1 ligne, datée, avec raison).

INTERDIT : modifier du code produit.
Termine par `ANALYZE_DONE` + ID de la cible choisie (ou `ANALYZE_DONE none`).
