# E11 — Trust row PassOffer : cadrage audit/panel (AUCUN CODE MODIFIÉ)

> Mission : audit uniquement. Base auditée : `origin/main @ 83a7d73fa` (lus via
> `git show`, worktree intouché). Aucune PR E11 existante (branches : seul
> `p0-cta-trust-fonts`, scope différent et ancien). E11 explicitement hors scope
> des livraisons précédentes (`PassOffer.jsx:44`).

## 1. Problème exact

`PassOffer` disperse sa réassurance en 5 micro-mentions texte (subline, sous-CTA,
trust-row `·`, sticky, badges sticky masqués ≤480px) mais ne possède **aucune
rangée iconée unique** (cadenas / calendrier / sans-abonnement) au point de
décision du CTA hero. À 390px, l'acheteur hésitant n'a aucun signal de confiance
scannable d'un coup d'œil entre le prix et le CTA.

## 2. Preuve existante

- Baseline funnel (mission J0-J30, à re-mesurer car fenêtre 14 j ancienne) :
  **modal→CTA ~1,3 %** (390 modales → 5 CTA) — cause diagnostiquée : friction,
  pas casse (chaîne buy→onPassBuy intacte, E2E verts).
- Inventaire vérifié sur `origin/main:src/PassOffer.jsx` : l115 « Paiement
  sécurisé · Accès immédiat », l150-153 « Mollie · Pas d'abonnement · 30 jours ·
  Paiement sécurisé », sticky « Mollie · Sans engagement · 2 clics » + badges
  (lock/card/zap, cachés ≤480px par lot 4). **Zéro rangée iconée statique** —
  E11 non implémenté (confirmé par grep + absence de PR).
- Tracking existant : `sg_pass_offer_view` (mount), `sg_pass_cta` (1× via
  `onPassBuy`) — aucune instrumentation à ajouter.

## 3. Surface concernée

`src/PassOffer.jsx` uniquement (rendu ×3 via A7 : World×2, Comic×1 — la rangée
suit partout par construction). Contact paywall : hero card → CTA → sticky →
checkout (`onPassBuy` → `passCtxRef` → `OnsiteCheckout`), verrouillé par
`passoffer-paths.test.cjs` — **intouché**.

## 4. Hypothèse utilisateur

« Je paierais bien 14,99 €, mais : est-ce sécurisé ? combien de temps ? et
surtout — est-ce que ça va me prélever tous les mois ? » La rangée répond aux
3 peurs en une ligne, sans scroll.

## 5. Hypothèse copy (FR/EN/ES — AUCUN fait nouveau, que du déjà-claimé)

- 🔒 `Paiement sécurisé / Secure payment / Pago seguro` (cf. l115)
- 📅 `30 jours / 30 days / 30 días` (cf. l150-153)
- 🚫 `Sans abonnement / No subscription / Sin suscripción` (cf. l151)
- Interdit : tout chiffre fiabilité (doctrine hedged), tout nouveau claim prix.

## 6. Hypothèse positionnement

Rangée statique **sous le bouton CTA hero, au-dessus de la ligne « Paiement
sécurisé · Accès immédiat »** (l103-109) : reste dans la carte hero, au-dessus
de l'email (contrat j0 `offerY < emailY` préservé par construction), pas de
duplication du sticky (contexte différent : preuve au clic vs rappel au scroll).
Variante comic : mêmes faits, styles `isComic` existants. Mobile-first : 1 ligne
en 390px (font ≤11px, séparateurs `·`), pas de layout shift (hauteur réservée ou
remplacement de la ligne l103 existante — à trancher à l'implémentation, sans
dépasser +24px).

## 7. Métrique primaire / secondaires / événements

- Primaire : **CTA rate = `sg_pass_cta` / `sg_pass_offer_view`** (funnel Supabase).
- Secondaires : `onsite_checkout_opened` / `sg_pass_cta`, taux fermeture paywall,
  0 `pageerror`.
- Événements : existants, rien à instrumenter. Baseline à re-mesurer sur 7 j
  pré-ship (le 1,3 % est périmé).

## 8. Baseline disponible / critère de succès

- Baseline : re-mesure 7 j exigée avant merge (le chiffre 1,3 % date de J0-J30).
- Succès : lift CTA rate vs fenêtre pré, sans baisse aval (checkout, close),
  E2E verts, 0 pageerror, bundle ≤ 210 Ko.

## 9. Risques

- Dépassement 390px / wrap cassé (mitigé : font petite, test 360/390/430).
- Conflit visuel sticky (mitigé : contextes distincts, sticky inchangé).
- Skin thème comic sur nouveaux éléments (mitigé : `currentColor`/inline, pattern
  armure éprouvé si besoin + test computed).
- i18n : longueurs EN/ES (mitigé : strings courtes déjà shippées).
- FauxKim : aucun nouveau tracking = aucune PII.

## 10. Rollback minimal

Flag `?trust_row=0` (pré-planifié dans 30DAY_BATTLE_PLAN) + revert 1 commit.
Aucun flag Apps Script, aucun secret, aucun montant.

## 11. Panel adverse (1 lentille + avocat du diable)

- CRO : la rangée ajoute de la friction visuelle ? Non : elle remplace de
  l'attention dispersée (5 mentions) par 1 scan — à valider par la mesure.
- Avocat du diable : si le CTA rate ne bouge pas à 7 j, revert (coût ≈ 0).
  Ne pas transformer en A/B multivarié : 1 changement, 1 métrique.

## VERDICT : READY_FOR_CODE

Évidence suffisante : emplacement exact, copy recyclée, métriques + baseline
accessibles, rollback planifié, tests identifiés (`passoffer-cta-copy` pattern,
j0 géométrie, computed-style). Seul prérequis : re-mesure baseline 7 j.
