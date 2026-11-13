# Catalogue Stripe LIVE à créer — compte Sargasses

Compte : `acct_1UZv9LDrGo8CQxeJ` (Sargassummiami).

À créer par le propriétaire. Cette liste ne crée rien, ne pose aucune clé, et ne déploie pas le checkout. Le worker live répond aujourd'hui **404** sur `/api/stripe-webhook` : ne pas y envoyer d'événements LIVE tant que le déploiement du handler n'est pas explicitement accepté.

Les montants sont ceux déjà catalogués dans le code (`PASS_PRICES`, `B2B_PLANS`). L'annuel n'est pas « 2 mois offerts » : 79 × 10 = 790 € et 89 × 10 = 890 $, alors que les prix encaissables sont 690 € et 790 $. Aucun produit « Territoire / Coastline » : 199 € et 219 $ ne sont dans aucun catalogue de paiement.

## Produits et prix

Metadata commune à poser sur le **Price** (et recopiée sur la Checkout Session) : `offer_kind`, `pass` ou `plan`, `days` quand c'est un pass.

| Produit | Prix | Devise | Type | Metadata |
|---|---|---|---|---|
| Pass 7 jours | 7.99 | EUR | one-time | `offer_kind=b2c_pass` `pass=trip7` `days=7` |
| Pass 7 days | 8.99 | USD | one-time | `offer_kind=b2c_pass` `pass=trip7` `days=7` |
| Pass 30 jours | 14.99 | EUR | one-time | `offer_kind=b2c_pass` `pass=p30` `days=30` |
| Pass 30 days | 16.99 | USD | one-time | `offer_kind=b2c_pass` `pass=p30` `days=30` |
| Pass saison 210 jours | 24.99 | EUR | one-time | `offer_kind=b2c_pass` `pass=season` `days=210` |
| Season pass 210 days | 27.99 | USD | one-time | `offer_kind=b2c_pass` `pass=season` `days=210` |
| Pro mensuel | 79.00 | EUR | recurring, interval `month` | `offer_kind=b2b_subscription` `plan=pro_monthly` |
| Pro monthly | 89.00 | USD | recurring, interval `month` | `offer_kind=b2b_subscription` `plan=pro_monthly_usd` |
| Pro 12 mois | 690.00 | EUR | one-time | `offer_kind=b2b_annual` `plan=pro_annual` `days=365` |
| Pro 12 months | 790.00 | USD | one-time | `offer_kind=b2b_annual` `plan=pro_annual_usd` `days=365` |

Brief (déjà dans le code, pas mis en avant sur `/offres/`) si vous voulez le même compte :

| Produit | Prix | Devise | Type | Metadata |
|---|---|---|---|---|
| Brief mensuel | 29.00 | EUR | recurring, interval `month` | `offer_kind=b2b_subscription` `plan=brief_monthly` |
| Brief 12 mois | 290.00 | EUR | one-time | `offer_kind=b2b_annual` `plan=brief_annual` `days=365` |

## Webhook

- URL (après accord de déploiement) : `https://sargasses-martinique.com/api/stripe-webhook`
- Le même chemin doit répondre sur les six domaines ; un seul endpoint sur le compte suffit si le handler lit le domaine dans les metadata.
- Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.
- La livraison d'accès se fait sur `checkout.session.completed` et `checkout.session.async_payment_succeeded` seulement si `payment_status` est `paid` (ou `no_payment_required` n'est pas un cas ici). Le retour navigateur ne confirme jamais un paiement.

## Variables d'environnement (noms seulement)

À renseigner sur le worker `sg-payments` et dans les secrets GitHub, sans les coller dans le dépôt :

- `STRIPE_SECRET_KEY` — clé restreinte `rk_live_…` du compte `acct_1UZv9LDrGo8CQxeJ` (pas la clé du compte de test `acct_1UZwjTDCQkzI0NeM`)
- `STRIPE_WEBHOOK_SECRET` — secret de signature `whsec_…` de l'endpoint ci-dessus
- `STRIPE_PRICE_TRIP7_EUR`
- `STRIPE_PRICE_TRIP7_USD`
- `STRIPE_PRICE_P30_EUR`
- `STRIPE_PRICE_P30_USD`
- `STRIPE_PRICE_SEASON_EUR`
- `STRIPE_PRICE_SEASON_USD`
- `STRIPE_PRICE_PRO_MONTHLY_EUR`
- `STRIPE_PRICE_PRO_MONTHLY_USD`
- `STRIPE_PRICE_PRO_ANNUAL_EUR`
- `STRIPE_PRICE_PRO_ANNUAL_USD`

`MOLLIE_API_KEY` reste la caisse actuellement branchée dans le code (`PAY_PROVIDER` par défaut `mollie`). Ne pas la remplacer par une clé test, et ne pas la basculer depuis cette liste.
