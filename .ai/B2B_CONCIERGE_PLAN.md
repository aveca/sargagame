# Plan B2B Concierge — Vertical Slice (FINAL)

> **Règle** : ne construire QUE le chemin minimal jusqu'au premier paiement.
> Pas de dashboard. Pas de reporting auto. Pas d'import massif.
> Un seul prospect. Un seul paiement. Ensuite seulement on industrialise.
>
> **Après le vertical slice : ARRÊTER le développement. Aller chercher le premier hôtel.**

---

## Les4 milestones

| Milestone | Critère | Signification |
|-----------|---------|---------------|
| **1. Technique** | Un prospect peut parcourir tout le chemin `Prospect → PAID` sans intervention technique manuelle | Le système fonctionne |
| **2. Commercial** | Un hôtel réel effectue réellement le paiement de 29€ | Le mécanisme de vente fonctionne |
| **3. Répétabilité** | Au moins 3 hôtels distincts paient | Le marché existe |
| **4. Industrialisation** | Import 148, dashboard, reporting, WhatsApp, NLP, détection de patterns | Seulement maintenant |

**Le vertical slice couvre uniquement le Milestone 1.**
**Le Milestone 2 nécessite un vrai hôtel. Pas de code.**

---

## Critère de validation du vertical slice

Je dois pouvoir ouvrir le chat B2B et faire :

```
1. "Ajoute Hôtel Martinique Beach, plage de Sainte-Anne, 0596000000"
   → prospect créé dans Supabase (status = 'new')
   → événement PROSPECT_CREATED logué

2. "Contacte Martinique Beach"
   → enregistre le contact
   → "J'ai parlé à Jean. Ils surveillent Facebook. 2 avis négatifs en juin."
   → score P×F×C×V calculé
   → événement CONTACTED + PROBLEM_CAPTURED logués

3. "Martinique Beach accepte le concierge"
   → concierge démarré (status = 'active', current_day = 0)
   → événement CONCIERGE_ACCEPTED logué

4. "Prépare J1 Martinique Beach"
   → prévision récupérée depuis sargassum.json
   → message préparé (status = 'ready')
   → événement FORECAST_PREPARED logué

5. "J1 envoyé Martinique Beach"
   → status = 'sent', sent_at = now()
   → événement DAY_1_SENT logué

6. [J2-J6 : même processus]
   → événements DAY_2_SENT ... DAY_6_SENT logués

7. "Prépare J7 Martinique Beach"
   → J7 généré
   → événement FORECAST_PREPARED logué

8. "J7 envoyé Martinique Beach"
   → événement DAY_7_SENT logué

9. "Demande le paiement à Martinique Beach"
   → checkout Mollie créé (action: create_subscription, plan: brief_monthly)
   → lien affiché dans le chat
   → événements PAYMENT_REQUESTED + CHECKOUT_CREATED logués

10. [Le client paie 29€ via Mollie]
    → webhook reçu
    → b2b_payments → status = 'paid', paid_at = now()
    → b2b_prospects → status = 'paid'
    → b2b_concierge → payment_confirmed = true
    → événement PAYMENT_CONFIRMED logué
    → token widget émis via mol_b2b_grant_once()
    → MRR += 29
```

**Tests d'échec obligatoires :**

| Scénario | Comportement attendu |
|----------|---------------------|
| Paiement abandonné | webhook `payment.failed` → status = 'failed', événement logué |
| Webhook reçu deux fois | Idempotence → pas de double comptage |
| Webhook invalide | Rejeté (HMAC), erreur loguée |
| Paiement refusé | webhook `payment.failed` → status = 'failed' |
| Concierge déjà démarré | Erreur : "concierge already active" |
| J7 lancé deux fois | Idempotence : pas de double envoi |
| Prospect inexistant | Erreur : "prospect not found" |
| Jour hors range (J8) | Erreur : "invalid day, max 7" |

---

## Logging d'événements

**Chaque événement doit être enregistré avec :**

```json
{
  "id": "uuid",
  "timestamp": "2026-08-17T12:00:00Z",
  "prospect_id": "uuid",
  "type": "EVENT_TYPE",
  "actor": "founder | system | webhook",
  "metadata": {}
}
```

**Types d'événements (V1) :**

| Type | Quand | Metadata |
|------|-------|----------|
| `PROSPECT_CREATED` | Ajout d'un prospect | `{name, beach, island}` |
| `CONTACTED` | Enregistrement d'un contact | `{channel, summary}` |
| `PROBLEM_CAPTURED` | Score P×F×C×V mis à jour | `{problem, frequency, cost, willingness, scores}` |
| `CONCIERGE_ACCEPTED` | Début du concierge | `{start_date, end_date}` |
| `FORECAST_PREPARED` | Prévision générée | `{day_number, beach, risk_level, confidence}` |
| `DAY_N_SENT` | Prévision envoyée | `{day_number, channel}` |
| `PAYMENT_REQUESTED` | Demande de paiement | `{amount, currency, plan}` |
| `CHECKOUT_CREATED` | Lien Mollie généré | `{mollie_payment_id, checkout_url}` |
| `PAYMENT_CONFIRMED` | Webhook paiement reçu | `{mollie_payment_id, amount}` |
| `PAYMENT_FAILED` | Paiement échoué | `{reason}` |
| `CONCIERGE_COMPLETED` | Fin du concierge J7 | `{days_completed}` |

**L'historique complet doit rester disponible à tout moment.**

---

## Commandes déterministes V1 (chat)

**Pas de NLP. Pas de LLM. Juste des regex.**

| Commande | Pattern | Action |
|----------|---------|--------|
| `ajoute hôtel X` | `/ajoute\s+(.+?)(?:,\s*plage\s+(.+?))?(?:,\s*(.+))?$/i` | Créer prospect |
| `contacte X` | `/contacte\s+(.+)/i` | Enregistrer contact |
| `X accepte le concierge` | `/(.+) accepte le concierge/i` | Démarrer concierge |
| `prépare J[N] X` | `/prépare\s+J(\d+)\s+(.+)/i` | Générer prévision |
| `J[N] envoyé X` | `/J(\d+)\s+envoyé\s+(.+)/i` | Marquer envoyé |
| `demande paiement X` | `/demande\s+paiement\s+(.+)/i` | Créer checkout Mollie |
| `montre prospects` | `/montre\s+prospects/i` | Lister prospects |
| `montre funnel` | `/montre\s+funnel/i` | Afficher funnel |

**Les commandes naturelles ("J'ai appelé Jean, il m'a dit que...") seront ajoutées APRÈS le premier paiement.**

---

## Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│                    SARGAGAME B2B CONCIERGE                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────────┐                   │
│  │  SargaChat   │───▶│  SargaChatB2B    │                   │
│  │  (existant)  │    │  (nouveau)       │                   │
│  │  B2C only    │    │  Commandes regex │                   │
│  └──────────────┘    └────────┬─────────┘                   │
│                               │                              │
│                     ┌─────────▼─────────┐                   │
│                     │  Supabase         │                   │
│                     │  7 tables B2B     │                   │
│                     │  + events         │                   │
│                     └─────────┬─────────┘                   │
│                               │                              │
│              ┌────────────────┼────────────────┐            │
│              ▼                ▼                ▼            │
│     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│     │  Forecast    │ │  Mollie      │ │  Resend      │    │
│     │  Pipeline    │ │  Payment     │ │  Email       │    │
│     │  (existant)  │ │  (existant)  │ │  (existant)  │    │
│     └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Fichiers :**

| Fichier | Rôle |
|---------|------|
| `src/SargaChatB2B.jsx` | Module chat B2B (importé dans SargaChat) |
| `public/api/b2b-prospects.php` | CRUD prospects |
| `public/api/b2b-contacts.php` | Enregistrer contacts |
| `public/api/b2b-scores.php` | Scores P×F×C×V |
| `public/api/b2b-concierge.php` | Démarrer/gérer concierge |
| `public/api/b2b-forecast-delivery.php` | Prévisions |
| `public/api/b2b-create-checkout.php` | Checkout Mollie |
| `public/api/b2b-payment-webhook.php` | Webhook paiement |
| `scripts/automation/b2b-event-logger.cjs` | Helper logging événements |

---

## DB minimale (7 tables)

```sql
-- 1. Prospects
CREATE TABLE b2b_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  beach TEXT,
  island TEXT,
  phone TEXT,
  email TEXT,
  grade TEXT DEFAULT 'A',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Contacts
CREATE TABLE b2b_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES b2b_prospects(id),
  date TIMESTAMPTZ DEFAULT now(),
  channel TEXT,
  summary TEXT,
  raw_transcript TEXT
);

-- 3. Scores
CREATE TABLE b2b_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES b2b_prospects(id),
  problem_score INT DEFAULT 0,
  frequency_score INT DEFAULT 0,
  cost_score INT DEFAULT 0,
  willingness_score INT DEFAULT 0,
  total_score INT DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Concierge
CREATE TABLE b2b_concierge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES b2b_prospects(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active',
  current_day INT DEFAULT 0,
  payment_requested BOOLEAN DEFAULT false,
  payment_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Prévisions envoyées
CREATE TABLE b2b_forecast_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concierge_id UUID REFERENCES b2b_concierge(id),
  prospect_id UUID REFERENCES b2b_prospects(id),
  beach TEXT,
  forecast_date DATE,
  day_number INT,
  risk_level TEXT,
  confidence INT,
  explanation TEXT,
  recommended_action TEXT,
  channel TEXT DEFAULT 'email',
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Paiements
CREATE TABLE b2b_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES b2b_prospects(id),
  concierge_id UUID REFERENCES b2b_concierge(id),
  amount DECIMAL(10,2) DEFAULT 29.00,
  currency TEXT DEFAULT 'EUR',
  plan TEXT DEFAULT 'brief_monthly',
  status TEXT DEFAULT 'pending',
  mollie_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- 7. Événements (historique immuable)
CREATE TABLE b2b_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES b2b_prospects(id),
  type TEXT NOT NULL,
  actor TEXT DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Estimation

| Phase | Contenu | Estimation |
|-------|---------|-----------|
| 1 | DB minimale (7 tables Supabase) | 2h |
| 2 | Endpoints PHP minimaux (8 endpoints) | 3h |
| 3 | Chat B2B déterministe (SargaChatB2B.jsx) | 3h |
| 4 | Génération de prévision | 2h |
| 5 | Paiement Mollie + webhook | 2h |
| 6 | Tests (succès + échecs) | 2h |
| **Total** | **Vertical slice complet** | **~14h** |

---

## 🚨 Freeze total après les ~14h de dev

**Pendant la phase terrain :**

### INTERDIT

| Action | Pourquoi |
|--------|----------|
| Nouvelles fonctionnalités | Pas de preuve que le marché existe |
| Refonte UI | Le chat déterministe suffit |
| Nouveau scraper | Les 148 prospects existent déjà |
| NLP | Les regex suffisent pour V1 |
| Optimisation du prompt | Pas de LLM dans le chat |
| Nouveau dashboard | Le chat suffit pour 1-3 hôtels |
| Ajout de WhatsApp | Email suffit pour le sprint |
| Modification du prix | Pas sur la base d'une seule hésitation |
| Correction du produit | Pas sur la base d'une seule demande |

### AUTORISÉ

| Action | Condition |
|--------|-----------|
| Corriger un bug qui empêche le parcours Prospect → PAID | Le systeme doit fonctionner |
| Corriger une erreur de prévision | Données fiables = moat |
| Corriger un problème empêchant l'envoi/réception | Le canal doit fonctionner |
| Enregistrer les retours terrain | Observations, pas modifications |
| Améliorer le script commercial | Fichiers de vente, pas produit |

---

## 🎯 Objectif terrain

Ne pars même pas avec l'objectif :

> "Je dois vendre Sargagame."

Pars avec :

> **"Je dois trouver un hôtel pour lequel les prévisions deviennent suffisamment utiles en 7 jours pour qu'il accepte de payer 29€."**

Et fais-le **en personne** lorsque possible, puisque ton marché est local.

---

## Tableau de suivi par hôtel

```
Hôtel :
Contact réel : OUI/NON

Problème :
P×F×C×V :

Concierge accepté : OUI/NON
J1 envoyé :
J2 :
J3 :
J4 :
J5 :
J6 :
J7 :

Utilité perçue :
Utilisation réelle :
Objection :

"Qu'est-ce qui ferait que 29€ serait évident ?"

Paiement demandé :
Paiement effectué : OUI/NON
```

---

## Le moment le plus important

Quand tu arrives au J7 :

> **"Je vous l'active à 29 €/mois ?"**

Puis **silence**.

Ne sauve pas la conversation.
Ne justifie pas immédiatement le prix.
Ne recommence pas ton pitch.

**Laisse la réponse arriver.**

Parce que ce que tu cherches maintenant n'est plus du feedback.

**Tu cherches une transaction.**

---

## Si le premier paie

🎯 **STOP.**

Ne construis rien.

Prends les 10 prochains hôtels et répète **exactement le même protocole**.

Ton tableau devient :

```
1/1 → 1/3 → 2/3 → 3/3
```

Quand tu arrives à **3 paiements**, là tu as suffisamment de signal pour commencer à réfléchir sérieusement à l'industrialisation.

---

## Le vrai chemin

```
14h de code
    →
7 jours de terrain
    →
1er paiement
    →
10 conversations supplémentaires
    →
3 paiements
    →
seulement ensuite scale
```

C'est beaucoup plus intelligent que de passer encore plusieurs semaines à automatiser un funnel qui n'a pas encore prouvé qu'il convertissait.

---

## Règle finale

**Après le vertical slice :**

1. Démontrer les12 étapes du parcours complet
2. Démontrer les7 tests d'échec
3. **ARRÊTER le développement**
4. Aller chercher le premier hôtel
5. Obtenir 29€ réellement encaissés
6. **Ensuite seulement** : décider quoi construire avec les 148 prospects

**Le prochain objectif n'est plus technique. C'est : 29€ réellement encaissés.**
