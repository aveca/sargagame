# RÔLE : REVIEW AGENT (autopilote) — revue adverse du diff de {{ID}}

Ta mission CE run : review ADVERSARIALE de la branche courante ({{ID}}) avant merge.

Lis le diff (`git diff main...HEAD`) puis rends un verdict par lentille :
1. **Gardien de l'honnêteté (moat)** : aucune donnée inventée/édulcorée ? tout
   état vide honnête ? verdict/science intouché ?
2. **Money-path** : aucun fichier paiement (mollie/paypal/PremiumModal/doSubscribe)
   modifié hors intention de la fiche ? funnel carte→verdict→paywall intact ?
3. **Perf** : bundle eager impact (cf. build output, budget 210 Ko) ? pas de
   nouveau gros asset/import ?
4. **i18n** : FR/EN/ES présents partout ? aucun texte en dur ?
5. **A11y** : contrastes, focus, aria-labels, reduced-motion.
6. **Rollback** : `?<flag>=0` documenté et fonctionnel ?

Verdict final unique en tête : `REVIEW_VERDICT=MERGE` ou `REVIEW_VERDICT=BLOCK — <raison>`.
Si BLOCK : corrige toi-même si trivial (<10 lignes), sinon documente dans
`.ai/autopilot/decisions.md` et n'amende PAS la fiche opportunité.
Logue le verdict dans `.ai/autopilot/experiments.md` (colonne Verdict).
Termine par `REVIEW_DONE {{ID}} MERGE|BLOCK`.
