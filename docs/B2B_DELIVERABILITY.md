# B2B deliverability — la SEULE action fondateur pour débloquer les clients

> Verdict du panel revenue (2026-07-02) : le funnel qui rapporte est le B2B, il **envoie déjà**
> (cold outreach + drip + followups dans `daily-copernicus.yml`), mais **tout part de
> `alerte@sargasses-martinique.com` partagé, sans domaine d'envoi B2B dédié**. Résultat :
> les emails de vente tombent en spam → ramper `CAP_NEW` = progresser sur **zéro délivré**.
> C'est le **multiplicateur de tout le reste** : rien ne convertit tant que ça n'arrive pas.

## Ce que Claude a déjà fait (aucune action requise)

- **Instrumentation du funnel B2B** (PR `feat/b2b-funnel-visibility`) : `sg_analytics_event()`
  (mollie-lib.php) écrit dans Supabase `analytics_events` (clé **publique** anon, zéro secret) :
  - `b2b_trial_started` — émis par `b2b-trial.php` à chaque essai lancé.
  - `b2b_trial_to_paid` — émis par `mollie-webhook.php` à chaque paiement Pro (récurrent + annuel).
  - Lecture : `node scripts/automation/funnel-b2b-from-supabase.cjs` → **essais / payés / taux essai→payé**.
  Le seul funnel qui produit du revenu est désormais **mesurable** (avant : angle mort total).
- `b2b-cold-outreach.cjs:34` lit **déjà** `process.env.B2B_FROM` → **zéro code à écrire côté envoi.**

## L'action fondateur (≈ 20 min, une fois) — DNS + 1 secret

L'envoi B2B passe par **Resend** (cf. `mol_b2b_trial_email`, `cfg.resend_key`). Pour un domaine dédié :

1. **Choisir un domaine/sous-domaine d'envoi B2B** dédié (n'expose pas la réputation d'`alerte@`) :
   - option simple : un **sous-domaine** de l'existant, ex. `pro.sargasses-martinique.com` ;
   - option marque : un domaine neuf type `veilleur-pro.com`.
2. **Dans Resend → Domains → Add domain**, saisir ce domaine. Resend affiche 3 enregistrements DNS à créer chez le registrar (Namecheap) :
   - **SPF** (`TXT` sur le sous-domaine) : `v=spf1 include:resend.com ~all` (ou la valeur exacte donnée par Resend).
   - **DKIM** (`TXT`/`CNAME` `resend._domainkey…`) : coller la valeur exacte de Resend.
   - **DMARC** (`TXT` sur `_dmarc.<domaine>`) : `v=DMARC1; p=none; rua=mailto:dmarc@<domaine>` (démarrer en `p=none`, monter vers `quarantine` après ~2 semaines propres).
3. Attendre la **vérification verte** dans Resend (propagation DNS, quelques minutes à quelques heures).
4. **Poser le secret** `B2B_FROM` = l'adresse d'envoi sur ce domaine, ex. `Le Veilleur <pro@pro.sargasses-martinique.com>` :
   - GitHub → repo `aveca/sargagame` → Settings → Secrets and variables → Actions → **New repository secret** `B2B_FROM`.
5. **Warm-up** : ne PAS relancer `CAP_NEW` à fond tout de suite. Monter progressivement **5 → 8 → 12 / jour** sur ~2 semaines en surveillant bounces/spam. Le code lit `B2B_FROM` automatiquement au prochain run planifié.

## Après ça (Claude, sans action fondateur)

- Ramper l'outreach une fois le domaine chaud + surveiller la délivrabilité via `funnel-b2b`.
- Étendre la séquence outreach à 4 touches value-first (constat-plage → relance → `/fiabilite/` → mini-étude PDF auto).
- Combler l'**activation** : email post-essai « votre snippet `<script>` + votre widget live sur VOTRE plage » (le widget posé = le prédicteur de conversion).
- Câbler `b2b_widget_activated` (faire passer au widget son host d'intégration → signal d'intention #1).

**Cible : 3–5 hôtels payants en 60 j** = plus que tout gain B2C réaliste sur la même fenêtre.
