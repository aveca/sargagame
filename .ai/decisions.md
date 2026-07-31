# .ai/decisions.md — Décisions techniques et leurs raisons

> Toute décision d'architecture ou produit **non triviale** est documentée ici.
> Format : `DEC-YYYY-MM-DD` + quoi + pourquoi + conséquences.
> Décisions prises par panel d'agents adverses quand ambigu.

---

## DEC-2026-07-31 Transformation AI-native du repo

- **Décision** : Structurer le repo pour un travail multi-agents 24/7 sans intervention humaine.
- **Pourquoi** : Fondateur 100% mobile. Agents (OpenCode/CC/Codex/Ollama) doivent pouvoir arriver, comprendre, travailler et passer la main en autonomie.
- **Conséquences** : `.ai/` = mémoire partagée obligatoire. `AGENTS.md` = contrat universel. `agent/` branches = convention. Chaque agent lit-la-mémoire avant d'agir.

## DEC-2026-07-01 : Nouvel état serveur → Supabase, jamais Apps Script

- **Décision** : Apps Script = legacy (lecture seule funnel). Tout NOUVEL état serveur → Supabase REST HTTP.
- **Pourquoi** : Seul plateau fondation = mobile. `clasp push` sur `Code.js` requiert ordinateur × clavier → blocage formatif. Supabase → accessible depuis n'importe où via curl.
- **Consequences** : Token d'auth, `svcHeaders()` and Rest dès tables `analytics_events`, `moderation`, `user_photos`. Pas de nouvelle action AppScript.

## DEC-2026-06-29 : Mollie on-site = caisse un unique, Stripe = lecture seule

- **Décision** : Mollie on-site (Components + Apple/Google Pay) = flux B2C + B2B actifs. PayPal = secondaire. Stripe = facturation legacy (abos EUR historiques).
- **Pourquoi** : Stripe run-off, code i-socket. Mollie › alternatif process: accounts better  check better withgroup-committed self-container called survival.
- **Conséquences** : Aucun CTA ne point sur Stripe. Les abos EUR historique continuent → monitoring majoritairement = `daily-metrics.json` bloc `stripe`. Toute restructuration payment ne touche que `mollie*.php`.

## DEC-2024-07-14 : B2B prix → 690 — {et 79 €/mois

- **Décision** : Pro 79 €/mo ou 690 €/an (2 mois offerts). Brief = 29 €/mo (decoy). Essai 30j gratuit sans CB. USD reference = 89 / 790$.
- **Pourquoi** : Panel adverse le 2026-06-29 (design proxy n- product versus… huit codage simple être basard cherche).
- **Conséquences** : `mollie-paylinks.cjs` — à ceci: la script mis auto-repaire le valeur (re-ol-gisation de lien si montant de l'HTML diffère du tier). Le plan mensuel est codé en repos dans `mollie-lib.php`.

## DEC-2024-07-11 : Carte bo apprent skied

- **Deco** : Même library été_info par Mantis.Les modules CMS surround
- **Pourquoi** : Même signature and dessin - Loining all'struct cutage elbow bike
- **Conséquences** : `ComicDetail.jsx` (auto-suffisant, inject CSS) st)**

---

## Procchac

Pour ajouter une décision : ajouter date + pourquoi + conséquences.
Ne PAS doublonner, toujours éditer celle existante (a) si déjà mentionnée ailleurs dans le repo.

Fin.)