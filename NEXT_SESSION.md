# NEXT_SESSION — sargagame

*Session précédente : 2026-04-17 fin ~18h local (Shabbat entrée).*
*Historique Design complet : archives dans `C:\Users\user\design-output*\`*

## 🟢 Shipped aujourd'hui (10 commits)

### Funnel fixes
- `cb403f0` **CTA defer** — setTimeout autour de `window.location.href` pour flush beacons (50% leak ciblé)
- `59f7c66` **A/B pw_cta_order** — control (paid-first) vs sample_first

### Paywall Design v1 porté (5 commits)
- `ea3b20d` Bugs (card #3 z-index, close X, sample wrap)
- `16c0ebc` Social proof block + season eyebrow gold
- `29f1f17` Plan toggle container groupé
- `0538480` Foot trust row Stripe badge
- `291ea29` Lean bullets variant B (swap value cards)

### Paywall Design v2 porté
- `322334c` **Stripe Prelude** (A/B pw_prelude) — interstitial avant redirect, adresse 50% Stripe leak

### Map
- `f3e35e6` **Today's-pick hero banner** — score + beach + Itinéraire Google Maps (Design v2 Map Hero minimal port)

### Pro tier
- `5ce0ea2` Pro tier 9.99€ scaffold (inactif, manque STRIPE_LINK_PRO)

### CI
- `4c05d47` Concurrency + rebase -X theirs sur 4 workflows
- `266c4e5` npm cache + retention 14j sur 9 workflows
- `034e6f0` Revert content-gen weekend bump (API payant)

## 📊 A/B tests en cours de mesure

| A/B | Variants | Target |
|---|---|---|
| `pw_cta_order` | control · sample_first | Réduire modal_dismiss 85% |
| `pw_prelude` | direct · prelude | Réduire Stripe leak 50% |

Besoin **4-8 semaines** pour stat sig (184 modal opens / 28j actuels).
**Ne pas ajouter de nouveaux variants** d'ici là — fragmenterait le traffic.

## 🔴 Design v3 — NE PAS porter

`Map Hero v2` = redesign dark + saturated color fields. Casse brand cream/gold.
Dire à Design : stop rebrand, iterate on v1 mechanics only.

## 📋 Premier check au retour

```bash
# 1. Funnel ratios (post-3j)
curl -sL "https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel"
# target: cta_to_redirect >= 95% (up from 50%)

# 2. A/B splits
curl -sL "...?action=funnel" | python -c "import json,sys; d=json.load(sys.stdin); [print(k,v) for k,v in d.get('ab_variants',{}).items() if 'pw_' in k]"

# 3. GH Actions green
gh run list --limit 10 --json conclusion,workflowName
```

## 🎯 Décisions qui attendent

- **Activer Pro tier** : créer Stripe Payment Link 9.99€/mo + paste URL dans `STRIPE_LINK_PRO` constante ligne 341 → tier apparaît
- **GP SEO push** : position 70 → cible 20 (5x traffic). Le workflow `weekly-seo-automation` lundi matin s'en occupe automatiquement.
- **Modal_dismiss** : attendre data 4-8 semaines avant prochain iteration

## 🐛 Bug connu carte (pré-existant, à fixer)

**Superpositions + pins pas tous cliquables** sur `/` (carte) — utilisateur a confirmé le 2026-04-17 que ce bug existait AVANT mes commits. Pas causé par le hero banner (commit `f3e35e6` reverted quand même via `1d2b48d` pour pas cumuler le bruit).

Hypothèses à investiguer au retour :
- Leaflet cluster overlap en zone dense (Sainte-Marie NE, Diamant sud)
- Z-index conflit entre le Header top pill et un element flottant
- La carte des zones hazard orange/rouge pourrait intercepter des clics sur les pins
- Potentiellement lié aux `417 dead clicks` que Clarity a tracké sur `/` dans audit-summary.json

Pour diagnostic : screenshot + DevTools elements tab sur un pin non-cliquable → identifier quel element overlappe.

## 🚫 Ce qui reste bloqué côté Design

- Map Hero V2 dark = à rejeter
- Paywall v3 = pas demandé (attendre les data)
- Ui_kits/app/* = mocks preview, PAS prod — ignorer

## Assets locaux

- `C:\Users\user\design-output\` = v1 archive (Paywall AB Iteration 1)
- `C:\Users\user\design-output-v2\` = v2 archive (Paywall v2 + Map Hero v1)
- `C:\Users\user\design-v3\` = v3 archive (Map Hero v2 — NE PAS PORTER)
- `C:\Users\user\design-screenshots\` = 7 screenshots prod (pour partager à Design)
