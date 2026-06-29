# REFERRAL_LOOP.md — Parrainage incité « Invite un ami, vous gagnez tous les deux 1 mois »

> ⚠️ **SUPERSEDED (2026-06-29) — implémenté dans le chemin Mollie pass-only** (ledger pass-days dans `public/api/mollie.php` + crédit au webhook `paid`, action `claim_referral_credit`). Cette spec Stripe (coupon / balance-credit, `create-checkout.php`, crédit 4,99 €/mois récurrent) est **HISTORIQUE** : le modèle B2C est passé en **PASS-ONLY Mollie** (paiement unique, plus d'abonnement), donc les coupons d'abonnement et le balance-credit Stripe **ne s'appliquent plus**. La récompense vit désormais comme un **ledger de jours de pass** côté `mollie.php` (metadata customer `referral_code` / `referred_by`, crédit au webhook `paid`, réclamation via l'action `claim_referral_credit`). Stripe ne sert plus de caisse (16 abos EUR legacy uniquement). L'en-tête du §4 pointe désormais vers `mollie.php` / le webhook Mollie ; **tout le reste de cette spec (§0 TL;DR, §2 schéma, §4 détail, §7-§10) décrit la mécanique Stripe d'origine et est conservé tel quel pour l'historique de conception** — ne PAS l'appliquer en l'état (coupon / balance-credit / 4,99 € récurrent obsolètes). L'implémentation qui fait foi est le ledger pass-days de `mollie.php`.

> Spec d'implémentation. **Ne modifie PAS `src/Sargasses_PROD.jsx`** (un autre agent y travaille) — ce doc décrit le QUOI et le OÙ (numéros de ligne précis) ; l'écriture du code est faite ensuite par l'agent qui a la main sur le fichier.
>
> ⚠️ **Les numéros de ligne ci-dessous sont relevés le 2026-06-24 mais `Sargasses_PROD.jsx` est en cours d'édition par un autre agent** → ils peuvent dériver de quelques dizaines de lignes. Toujours re-localiser par **ancre textuelle** (donnée à côté de chaque ligne) avant d'éditer, pas par numéro brut. Ancres stables : `action:"subscribe"`, `sg_referred_by`, `sg_referral_code`, `REFERRAL LANDING BANNER`, `openPremium("referral_banner")`.
> Cible : **régions EUR (MQ + GP) uniquement** — les seules qui convertissent (16 abonnés, MRR ~80 €). Les régions USD (florida/puntacana/rivieramaya) ne reçoivent PAS la boucle au lancement (0 client → pas de viralité à amorcer, et la mécanique de crédit suppose un abonnement mensuel récurrent que l'US n'a quasi pas).

---

## 0. TL;DR de la mécanique

| Rôle | Action | Récompense |
|------|--------|-----------|
| **Parrain** (filleul ⇒ abonné) | Partage son lien `?ref=REF-XXXXXX` | **1 mois offert** (crédit Stripe 4,99 €) à la **conversion confirmée** du filleul |
| **Filleul** (nouveau) | Arrive via `?ref=`, s'abonne | **1er mois à 0 €** (coupon 100 % 1ʳᵉ facture) — au lieu de l'essai supprimé |

Double-face : le filleul a une raison concrète de cliquer (1er mois gratuit, ce qui **remplace l'essai 7j supprimé le 17/06** par un levier viral), et le parrain a une raison concrète de partager (il gagne autant). Boucle auto-entretenue : chaque nouvel abonné devient un parrain potentiel dès l'activation.

**Pourquoi ça attaque le bottleneck #1** (modal→CTA bloqué à 2 %) : le crédit donne au modal premium une **offre d'ancrage forte** (« 1er mois gratuit ») sans casser le prix affiché 4,99 €/mois, et il transforme les **16 abonnés actifs** en canal d'acquisition (ils n'ont aujourd'hui aucune raison de partager — le code référral était écrit mais **jamais activé en récompense**, cf. commentaire ligne 13704-13707).

---

## 1. État de l'existant (ce qui est DÉJÀ câblé)

Le squelette référral existe et est **fonctionnel en tracking** ; il manque uniquement (a) la **récompense réelle** (crédit Stripe) et (b) un **hub de partage premium** visible.

| Pièce | Emplacement | État |
|-------|-------------|------|
| Génération du code `sg_referral_code` | `Sargasses_PROD.jsx:~13770` (ancre `localStorage.setItem("sg_referral_code","REF-"…)`) | ✅ écrit à l'activation premium, stable par device (`hashSeed(_sgcCid()+":ref")`, préfixe `REF-`, 6 chars base36) |
| Lecture du code dans le partage plage | `Sargasses_PROD.jsx:~4723` (ancre `const refCode=isPremium?localStorage.getItem("sg_referral_code")`) | ✅ ajoute `?ref=CODE` à l'URL partagée si premium |
| Détection `?ref=` à l'atterrissage | `Sargasses_PROD.jsx:~13733` (ancre `localStorage.setItem("sg_referred_by",refCode)`) | ✅ stocke `sg_referred_by`, track `sg_referral_landing`, nettoie l'URL |
| Bandeau filleul « Recommandé par un ami » | `Sargasses_PROD.jsx:~15567` (ancre `REFERRAL LANDING BANNER`) | ✅ s'affiche 8 s, ouvre le modal premium (`openPremium("referral_banner")`) |
| Event critique queue + beacon | `Sargasses_PROD.jsx:1975` | ✅ `sg_referral_share` est déjà dans l'allowlist d'events critiques (queue localStorage + beacon Apps Script) |
| `sg_referral_share` émis quelque part | — | ❌ **MANQUE** : l'event est dans l'allowlist mais **aucun `track("sg_referral_share")` n'est appelé**. À ajouter au hub de partage (§5.2). |
| Récompense réelle (crédit/coupon) | `public/api/create-checkout.php` | ❌ **MANQUE** : aucun coupon/credit. À ajouter (§4). |
| Hub de partage premium dédié | — | ❌ **MANQUE** : aujourd'hui le code ne fuite que via le bouton 📤 d'une fiche plage. Il faut une surface explicite « Invite un ami » (§5). |
| Attribution conversion → parrain | webhook | ❌ **MANQUE** : le `sg_referred_by` n'est jamais transmis au checkout ni au webhook (§3, §4). |

**Conclusion** : ~60 % de la plomberie est posée. Le travail = (1) propager `sg_referred_by` jusqu'au serveur, (2) appliquer le crédit Stripe, (3) rendre le partage visible et incité.

---

## 2. Architecture de la boucle (vue d'ensemble)

```
  PARRAIN (abonné actif)
     │  ouvre le hub « Invite un ami » (SpaceSheet / modal)
     │  partage le lien  https://sargasses-martinique.com/?ref=REF-AB12CD
     ▼
  FILLEUL (nouveau visiteur)
     │  atterrit avec ?ref=REF-AB12CD
     │  → localStorage.sg_referred_by = "REF-AB12CD"   (déjà fait, ancre sg_referred_by)
     │  → bandeau « 1er mois offert »                  (ancre REFERRAL LANDING BANNER, copy à MAJ §6)
     │  clique CTA premium → checkout on-site
     │  → create-checkout.php action:subscribe         (referredBy transmis §3)
     │      ├─ applique coupon 100% 1ʳᵉ facture au FILLEUL  (§4.1)
     │      └─ enregistre l'attribution (referredBy, subId, email) (§4.2)
     ▼
  STRIPE  customer.subscription créée + 1ʳᵉ invoice à 0 €
     │  webhook checkout/subscribe → forward Apps Script (existant)
     │  + crédit le PARRAIN : balance_transaction -499¢ sur son customer (§4.3)
     ▼
  PARRAIN  voit « 1 mois offert grâce à ton invitation 🎁 »  (§5.3)
           sa prochaine facture mensuelle = 0 € (Stripe customer balance)
```

**Choix technique du crédit (important) :**
- **Filleul** = `coupon` Stripe `REFERRAL_FIRST_MONTH` (percent_off:100, duration:once) appliqué à la création de subscription. Propre, audité par Stripe, n'affecte que la 1ʳᵉ facture.
- **Parrain** = **customer balance credit** (`POST /v1/customers/{id}/balance_transactions` montant `-499`, devise `eur`). Stripe déduit automatiquement ce crédit de la prochaine facture. Pas besoin de coupon récurrent ni de toucher la subscription. Réversible et traçable.

Pourquoi pas un coupon des deux côtés ? Le parrain a une sub **déjà active** ; appliquer un coupon à une sub existante affecterait des factures futures de façon moins prévisible. Le **balance credit** est le primitif Stripe exact pour « offre 1 mois à un client existant ».

---

## 3. Propagation de `sg_referred_by` (front → serveur)

### 3.1 — Au moment du checkout (côté front, `Sargasses_PROD.jsx`)

Tous les `fetch("/api/create-checkout.php", {action:"subscribe"...})` doivent transmettre le code parrain s'il existe.

**Ancre précise** : la requête `subscribe` est construite en **`Sargasses_PROD.jsx:~7861`** — ligne `body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang,source:source||"unknown"})}` (le `fetch` principal du flow on-site ; voir aussi les autres `fetch("/api/create-checkout.php"` vers ~7660/7846/7979 pour les autres call-sites — seul `subscribe` a besoin du champ).

Modification à demander à l'agent : ajouter au body JSON de l'action `subscribe` (et `embedded` si utilisé) le champ :

```js
// juste avant le fetch action:"subscribe"
let referredBy=""; try{ referredBy=localStorage.getItem("sg_referred_by")||"" }catch(_){}
// ...dans le body JSON.stringify({ action:"subscribe", email, plan, setupIntentId, lang, source, referredBy })
```

Contraintes :
- Ne PAS transmettre si `referredBy` ne matche pas `/^REF-[A-Z0-9]{6}$/` (validation déjà implicite côté serveur §4).
- Ne PAS auto-parrainer : si `sg_referred_by === sg_referral_code` du même device → ignorer (anti-abus §7).

### 3.2 — Persistance du code parrain

`sg_referred_by` est déjà posé à l'atterrissage (ancre `localStorage.setItem("sg_referred_by",refCode)`, ~l.13733). **Ajouter un TTL** : stocker `{code, ts}` au lieu d'une string brute, et n'honorer l'attribution que si `Date.now()-ts < 30*86400*1000` (fenêtre d'attribution 30 j). C'est une modif du `useEffect` de détection `?ref=` (ancre `refCode&&refCode.startsWith("REF-")`).

> ⚠️ Changement de format : si on passe `sg_referred_by` de string → JSON, **mettre à jour aussi la lecture** au §3.1. Garder rétro-compat : `try JSON.parse; si échec → traiter comme string legacy`.

---

## 4. Récompense (HISTORIQUE Stripe `create-checkout.php` — voir bannière : implémenté en pass-days Mollie)

> ⚠️ **Le bloc §4 ci-dessous décrit l'ancienne mécanique Stripe** (coupon filleul + balance-credit parrain dans `create-checkout.php`). **NON retenu** : sous le modèle pass-only, la récompense est implémentée dans `public/api/mollie.php` — attribution via metadata customer Mollie (`referral_code` du parrain, `referred_by` du filleul, posés au `subscribe`/checkout, cf. `mollie.php`), crédit de **jours de pass** posé au **webhook Mollie `paid`** (et non un coupon d'abonnement ni un balance-credit), réclamés par l'app du parrain via l'action `claim_referral_credit`. Lire ci-dessous pour l'intention de conception (cap anti-abus, fenêtre d'attribution, idempotence), mais transposer les call-sites Stripe → `mollie.php` / webhook Mollie et la devise « −4,99 € / mois » → « jours de pass offerts ».

### 4.1 — Coupon filleul (1er mois gratuit)

Dans l'action `subscribe` (bloc **`create-checkout.php:252-389`**), après lecture des inputs :

```php
$referredBy = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['referredBy'] ?? ''));
$validRef = (bool)preg_match('/^REF-[A-Z0-9]{6}$/', $referredBy);
```

Puis, lors de la création de la subscription (`$subParams`, **l.285-291**), si `$validRef` ajouter :

```php
// 1er mois offert au filleul — coupon percent_off:100 duration:once.
// Le coupon doit exister dans le dashboard Stripe (id = 'REFERRAL_FIRST_MONTH').
if ($validRef && $island !== '' && in_array($island, ['mq','gp'], true)) {
    $subParams['coupon'] = $cfg['referral_coupon'] ?? 'REFERRAL_FIRST_MONTH';
    $subParams['metadata[referred_by]'] = $referredBy;
}
```

> ⚠️ **Le prélèvement est immédiat** (`$noTrial = true`, l.197). Avec un coupon 100 % once, la 1ʳᵉ facture = 0 € → la sub passe `active` sans PaymentIntent à confirmer (pas de 3DS sur 0 €). **Vérifier** que le flow front gère `status:"active"` sans `piClientSecret` (c'est déjà le cas, c'est le chemin nominal du trial supprimé). Le `default_payment_method` reste posé → la 2ᵉ facture (mois 2) sera prélevée normalement.

### 4.2 — Enregistrer l'attribution (pour créditer le parrain)

Le webhook signé est la vérité, mais il ne connaît PAS le mapping `code parrain → customer parrain`. Deux options :

**Option A (retenue) — résolution paresseuse côté `subscribe`** : juste après création de la sub filleul, dans le **bloc fire-and-forget** (`create-checkout.php:331-348`, là où on forward déjà vers Apps Script), créditer le parrain en synchrone serveur-à-serveur :

```php
// CRÉDIT PARRAIN — exécuté seulement si attribution valide ET sub filleul réellement active.
if ($validRef && in_array(($sub['status'] ?? ''), ['active','trialing'], true)) {
    sg_credit_referrer($referredBy, $island, $cfg);  // §4.3
}
```

`sg_credit_referrer` doit retrouver le **customer Stripe du parrain** à partir du code `REF-XXXXXX`. Or le code est dérivé du `cid` device, **pas stocké côté Stripe**. → Il faut que chaque abonné **écrive son code en metadata customer** à l'activation (§4.4), puis on cherche par metadata.

### 4.3 — Fonction `sg_credit_referrer` (nouvelle, dans `create-checkout.php`)

```php
function sg_credit_referrer($refCode, $island, $cfg) {
    // Cherche le customer parrain par metadata.referral_code (search API Stripe).
    $q = urlencode("metadata['referral_code']:'" . $refCode . "'");
    $res = stripe('GET', "/customers/search?query=$q&limit=1");
    $cust = $res['data'][0] ?? null;
    if (!$cust) return; // parrain introuvable → no-op (anti-abus : code forgé inerte)
    // Idempotence : ne pas créditer 2× le même filleul. On stamp via metadata
    // cumulative côté customer (compteur) + on borne le nb de crédits (§7).
    $given = (int)($cust['metadata']['referrals_credited'] ?? 0);
    if ($given >= 12) return; // cap : max 12 mois offerts / parrain / an (anti-abus)
    // Crédit 1 mois (montant négatif = crédit) sur le balance du customer.
    stripe('POST', "/customers/{$cust['id']}/balance_transactions", [
        'amount'   => -499,           // -4,99 € (EUR ; MQ/GP)
        'currency' => 'eur',
        'description' => "Referral reward ($refCode) " . date('Y-m-d'),
    ]);
    stripe('POST', "/customers/{$cust['id']}", [
        'metadata[referrals_credited]' => $given + 1,
    ]);
}
```

> Stripe `customers/search` indexe la metadata avec ~quelques secondes de latence. Comme le parrain s'est abonné AVANT le filleul (forcément), sa metadata est indexée depuis longtemps → OK.

### 4.4 — Écrire `referral_code` en metadata customer (à l'abonnement)

Pour que `sg_credit_referrer` puisse retrouver le parrain, **chaque** customer doit porter son code. Le code est dérivé du `cid` device côté front → il faut le **transmettre** au `subscribe` et l'écrire en metadata.

- **Front** : ajouter `myReferralCode: localStorage.getItem("sg_referral_code")` au body de l'action `subscribe` (même endroit que §3.1, ancre `action:"subscribe"`). Note : à ce stade le code n'existe pas encore (il n'est généré qu'À l'activation premium, ancre `localStorage.setItem("sg_referral_code","REF-"`). → **Anticiper** : générer le code AVANT le checkout. Demander à l'agent de déplacer/dupliquer la génération du code vers le moment où l'utilisateur ouvre le checkout (ou le générer à la volée dans le body si absent — même formule `"REF-"+hashSeed(_sgcCid()+":ref").toString(36).toUpperCase().slice(0,6)`).
- **Serveur** (`create-checkout.php`, `$customerParams` **l.271-275**) :

```php
$myRef = preg_replace('/[^A-Z0-9-]/', '', strtoupper($input['myReferralCode'] ?? ''));
if (preg_match('/^REF-[A-Z0-9]{6}$/', $myRef)) {
    $customerParams['metadata[referral_code]'] = $myRef;
}
```

### 4.5 — Config (`stripe-config.php` + `.example.php`)

Ajouter une clé :

```php
'referral_coupon' => 'REFERRAL_FIRST_MONTH', // id du coupon Stripe (percent_off:100, duration:once)
```

→ À documenter dans `stripe-config.example.php`. **Action fondateur** : créer le coupon dans le dashboard Stripe (§9).

---

## 5. Points d'ancrage UI dans `Sargasses_PROD.jsx`

### 5.1 — Hub « Invite un ami » dans l'espace premium (SpaceSheet)

Le composant `SpaceSheet` (espace compte) vit dans **`src/ChasseHome.jsx:702-771`**. Pour un abonné (`isPremium`), il affiche aujourd'hui le badge « Premium actif » + lien « Gérer mon abonnement » (**l.716-722**). C'est l'endroit naturel pour le hub.

**Ancre précise** : insérer un bloc référral juste après le bloc `<div className="lc-space-pro on">…</div>` (**après ChasseHome.jsx:722**), conditionné à `isPremium`. Il faut passer le code + un handler de partage en props depuis le parent (`Sargasses_PROD.jsx` où `<SpaceSheet …/>` est monté — chercher `<SpaceSheet` ; dans ChasseHome il est à **ChasseHome.jsx:1585**, lui-même rendu par l'app principale).

Contenu du bloc :
- Titre : « Invite un ami 🎁 »
- Sous-texte : « Vous gagnez tous les deux 1 mois. »
- Affiche le lien `https://<domain>/?ref=<code>` (lisible, copiable)
- Bouton **Partager** (native share + fallback clipboard) → émet `track("sg_referral_share",{method, code})` ⟵ **c'est ici qu'on déclenche enfin l'event déjà whitelisté l.1975**
- (Optionnel) compteur « X amis abonnés grâce à toi » si on l'expose (nécessite lecture metadata via un petit endpoint, hors-scope v1).

### 5.2 — Le bouton de partage premium (déclenche `sg_referral_share`)

Le partage plage existant (ancre `if(await shareBeachCard(beach,lang,forecast))return`, ~l.4720-4741) ajoute déjà `?ref=` mais émet `sg_share`, pas `sg_referral_share`. **Ne pas le modifier** (copy sous A/B, et c'est un partage de plage, pas un partage d'invitation).

À la place, le **nouveau** bouton du hub (§5.1) est le canal d'invitation explicite → il émet `sg_referral_share`. Logique de partage à répliquer (copy §6) :

```js
const code = localStorage.getItem("sg_referral_code")
const url = window.location.origin + "/?ref=" + code
const txt = _t(lang, REF_COPY.shareText.fr, REF_COPY.shareText.en, REF_COPY.shareText.es)
track("sg_referral_share",{method: navigator.share?"native":"clipboard", code})
if(navigator.share) navigator.share({title:"Sargasses", text:txt, url}).catch(()=>{})
else navigator.clipboard?.writeText(txt+" "+url)
```

### 5.3 — Confirmation côté parrain (récompense gagnée)

> ⚠️ **Correction transport email (2026-06-24)** : ce doc (ère Stripe) mentionne « Resend » /
> `resend()`. **Resend est abandonné** — tout email part désormais par **SMTP** (boîte
> `alerte@`, `scripts/automation/lib/email-send.cjs` via nodemailer). Au go-live Mollie,
> l'email de récompense parrain doit utiliser ce transport SMTP, pas Resend.

Quand un crédit est appliqué, le parrain n'a pas de feedback temps réel (le crédit se fait serveur-à-serveur, au webhook Mollie `paid`). **v1 simple** : afficher dans le hub (§5.1) le compteur de jours de pass crédités si on l'expose, OU envoyer un **email SMTP** au parrain (transport `scripts/automation/lib/email-send.cjs` via nodemailer ; **Resend abandonné**, ne pas réutiliser `resend()`), déclenché côté serveur quand le crédit est posé. Recommandation v1 : **email** « 🎁 Un ami s'est abonné — des jours de pass te sont offerts ». C'est tangible et n'exige aucune nouvelle surface front.

### 5.4 — Bandeau filleul (déjà là, copy à MAJ)

Ancre `REFERRAL LANDING BANNER` (~l.15567-15590). Garder la structure, **mettre à jour la copy** pour annoncer le 1er mois gratuit (§6). C'est le seul endroit où l'offre filleul doit être promise visuellement avant le modal. Le modal premium lui-même reçoit `openPremium("referral_banner")` → on peut, si l'agent du fichier le souhaite, faire afficher au modal un bandeau « 1er mois offert » quand `sg_referred_by` est présent (hors-scope strict, mais fort levier sur le modal→CTA).

---

## 6. Copy FR / EN / ES

À regrouper dans un objet `REF_COPY` (nouveau, dans `Sargasses_PROD.jsx` ou un module i18n importé) :

```js
const REF_COPY = {
  // Hub premium (§5.1)
  hubTitle:   { fr:"Invite un ami 🎁", en:"Invite a friend 🎁", es:"Invita a un amigo 🎁" },
  hubSub:     { fr:"Vous gagnez tous les deux 1 mois.",
                en:"You both get 1 month free.",
                es:"Ambos ganáis 1 mes gratis." },
  hubBody:    { fr:"Ton ami a son 1er mois offert. Dès qu'il s'abonne, on t'offre 1 mois à toi aussi.",
                en:"Your friend gets their 1st month free. As soon as they subscribe, you get 1 month too.",
                es:"Tu amigo tiene su 1er mes gratis. En cuanto se suscriba, tú también ganas 1 mes." },
  copyLink:   { fr:"Copier mon lien", en:"Copy my link", es:"Copiar mi enlace" },
  shareBtn:   { fr:"Partager mon invitation", en:"Share my invite", es:"Compartir mi invitación" },
  copied:     { fr:"Lien copié ✓", en:"Link copied ✓", es:"Enlace copiado ✓" },

  // Texte de partage (§5.2) — sans spoiler, donne envie
  shareText:  { fr:"Je surveille les sargasses avec cette appli — prévisions 7 jours par plage. Profite de ton 1er mois offert avec mon lien 👇",
                en:"I track sargassum with this app — 7-day forecast per beach. Get your 1st month free with my link 👇",
                es:"Sigo el sargazo con esta app — pronóstico de 7 días por playa. Consigue tu 1er mes gratis con mi enlace 👇" },

  // Bandeau filleul (§5.4) — remplace l.15518/15520
  guestBannerTitle: { fr:"Un ami t'offre ton 1er mois", en:"A friend gifts you your 1st month", es:"Un amigo te regala tu 1er mes" },
  guestBannerSub:   { fr:"Appuie pour activer — 1er mois à 0 €",
                      en:"Tap to activate — 1st month free",
                      es:"Toca para activar — 1er mes gratis" },

  // Email parrain (§5.3) — sujet + corps SMTP (FR/EN selon lang du filleul; défaut FR)
  rewardEmailSubject: { fr:"🎁 Un ami s'est abonné — 1 mois t'est offert",
                        en:"🎁 A friend subscribed — 1 month is on us",
                        es:"🎁 Un amigo se suscribió — 1 mes de regalo" },
  rewardEmailBody:    { fr:"Bonne nouvelle : un ami que tu as invité vient de s'abonner. Ton prochain mois est offert (–4,99 €). Merci de faire grandir la communauté 🌊",
                        en:"Good news: a friend you invited just subscribed. Your next month is free (–€4.99). Thanks for growing the community 🌊",
                        es:"Buenas noticias: un amigo que invitaste acaba de suscribirse. Tu próximo mes es gratis (–4,99 €). Gracias por hacer crecer la comunidad 🌊" },
}
```

> Le bandeau filleul actuel dit « Recommandé par un ami » / « Appuie pour découvrir Premium ». La nouvelle copy **promet l'offre** (1er mois à 0 €) — c'est ce qui transforme le clic. Garder le `🎁` et le gradient violet existants (le `<div>` du `REFERRAL LANDING BANNER`).

---

## 7. Anti-abus

| Vecteur | Garde-fou |
|---------|-----------|
| **Auto-parrainage** (même device) | Côté front (§3.1) : si `sg_referred_by === sg_referral_code` → ne pas transmettre `referredBy`. Côté serveur : si `metadata.referral_code` du nouveau customer == `referredBy` → ne pas créditer. |
| **Code forgé** (`?ref=REF-ZZZZZZ` inexistant) | `customers/search` ne trouve personne → `sg_credit_referrer` no-op. Le filleul garde son coupon (offre d'acquisition assumée), mais personne n'est crédité. |
| **Ferme de filleuls** (un parrain en invente 100) | Cap **12 crédits / parrain / an** via `metadata.referrals_credited` (§4.3). Au-delà → no-op. Ajustable. |
| **Crédit sans paiement réel** | `sg_credit_referrer` n'est appelé que si `$sub['status'] in ['active','trialing']` — donc carte validée et 1ʳᵉ facture (0 € via coupon) émise. Une carte refusée (`incomplete`) ne crédite pas. |
| **Double crédit même filleul** | Le crédit se fait dans le flow `subscribe` (une seule fois par création de sub). Si le filleul annule puis se réabonne, il n'a plus de `coupon` (le `sg_referred_by` aura expiré §3.2 ou été consommé) → pas de re-crédit. Optionnel renforcé : stamper `metadata.referred_by` sur le customer filleul et refuser un 2ᵉ crédit pour le même filleul (lookup avant crédit). |
| **Filleul = client churné qui revient** | Fenêtre d'attribution 30 j (§3.2) limite la réactivation déguisée en parrainage. |
| **Card-testing via referral** | Inchangé : le rate-limit `subscribe` (15/IP/h, `create-checkout.php:39`) couvre déjà ce endpoint. |
| **Abus du coupon hors référral** | Le coupon n'est appliqué que si `referredBy` matche le regex ET `island in [mq,gp]`. Pas exposé en Payment Link public. |

---

## 8. Tracking / mesure

Events (tous déjà compatibles avec la queue critique si besoin) :

| Event | Quand | Props |
|-------|-------|-------|
| `sg_referral_share` | clic partage dans le hub (§5.2) | `method` (native/clipboard), `code` |
| `sg_referral_landing` | atterrissage `?ref=` (déjà émis, ancre `track("sg_referral_landing"`) | `ref_code`, `island` |
| `sg_referral_convert` | **NOUVEAU** — filleul s'abonne avec un `referredBy` valide | émis côté front juste après `sg_conversion` si `sg_referred_by` présent ; ou dérivé serveur via metadata `referred_by` |
| `sg_referral_credit` | **NOUVEAU (serveur)** — crédit appliqué au parrain | loggé via le forward Apps Script dans `sg_credit_referrer` (réutiliser le `curl` existant l.344) |

KPI à suivre (skill `sargasses` / daily-metrics) :
- **k-factor** = (`sg_referral_share` → `sg_referral_landing` → `sg_referral_convert`) / abonnés. Objectif > 0,2 = boucle qui s'auto-alimente.
- Part des nouveaux abonnés portant un `referred_by` (metadata Stripe).
- Coût réel = nb crédits × 4,99 € (à confronter au LTV : 1 abonné retenu ~65 % post-mois-1).

---

## 9. Plan d'implémentation étape par étape

> Ordre = du moins risqué (config/serveur, testable isolément) au plus visible (UI sous A/B).

**Étape 0 — Action fondateur (Stripe dashboard)** :
- Créer un coupon `REFERRAL_FIRST_MONTH` : `percent_off: 100`, `duration: once`, devise EUR. Noter l'id exact.
- (Recommandé) Activer Stripe **Customer Search** (actif par défaut sur les comptes récents).

**Étape 1 — Config serveur** :
- `public/api/stripe-config.example.php` : ajouter `'referral_coupon' => 'REFERRAL_FIRST_MONTH'`.
- `public/api/stripe-config.php` (réel, gitignore, déployé FTP MQ+GP) : ajouter la même clé avec l'id réel. **Action fondateur (FTP)**.

**Étape 2 — `create-checkout.php` (serveur)** :
1. Action `subscribe` : lire/valider `referredBy` + `myReferralCode` (§3.1, §4.4).
2. Écrire `metadata[referral_code]` sur le customer (§4.4).
3. Appliquer `$subParams['coupon']` si `$validRef` (§4.1).
4. Ajouter la fonction `sg_credit_referrer` (§4.3) + l'appeler dans le bloc fire-and-forget (§4.2).
5. (Optionnel) email parrain via SMTP (`scripts/automation/lib/email-send.cjs`, **pas `resend()`** — Resend abandonné) au moment du crédit (§5.3).
- **Test** : `scripts/test-stripe-webhook.cjs` (cohérence) + un abonnement test bout-en-bout en mode test Stripe (carte 4242, avec et sans `?ref=`).

**Étape 3 — Front : propagation (`Sargasses_PROD.jsx`, par l'agent du fichier)** :
1. Générer `sg_referral_code` AVANT le checkout (déplacer/dupliquer l'ancre `localStorage.setItem("sg_referral_code","REF-"`) — ou à la volée dans le body.
2. TTL sur `sg_referred_by` (`useEffect` de détection `?ref=`, ancre `sg_referred_by`) — format `{code,ts}`, fenêtre 30 j.
3. Ajouter `referredBy` + `myReferralCode` au body de l'action `subscribe` (ancre `action:"subscribe"` ; vérifier les autres `fetch("/api/create-checkout.php"`).
4. Garde anti-auto-parrainage (§7).
5. Émettre `sg_referral_convert` après `sg_conversion` si `referredBy` présent.

**Étape 4 — Front : hub premium (`ChasseHome.jsx` + montage dans `Sargasses_PROD.jsx`)** :
1. Bloc « Invite un ami » dans `SpaceSheet` après l.722, gated `isPremium` (§5.1).
2. Bouton partage → `sg_referral_share` (§5.2).
3. Objet `REF_COPY` (§6).
- **Réversibilité** : gater le bloc derrière un flag URL (ex. `?referral=0` masque) comme les autres surfaces (cf. `?streak7=0` ChasseHome.jsx:789), pour pouvoir le retirer sans redeploy de fond.

**Étape 5 — Front : copy bandeau filleul** :
- MAJ les deux `<div>` de texte du `REFERRAL LANDING BANNER` (« Recommandé par un ami » + « Appuie pour découvrir Premium ») avec `REF_COPY.guestBannerTitle` / `guestBannerSub` (§5.4). **Ne pas toucher** au gradient/positionnement (le `<div onClick={()=>{openPremium("referral_banner")…`).

**Étape 6 — Mesure** :
- Ajouter `sg_referral_convert` / `sg_referral_credit` au reporting daily-metrics (skill `sargasses`).
- Laisser tourner 2-4 semaines, surveiller k-factor + coût crédits vs nouveaux abonnés.

**Étape 7 (futur, hors v1)** :
- Surface filleul→parrain dans le modal premium (afficher « 1er mois offert » quand `sg_referred_by` présent) — fort levier sur modal→CTA, mais touche du copy sous A/B → à traiter comme un nouvel A/B test `pw_referral_anchor`.
- Compteur temps réel « X amis abonnés » (endpoint lecture metadata).
- Étendre aux régions USD une fois ≥ qq abonnés (adapter devise/montant du balance credit + coupon USD).

---

## 10. Récapitulatif des fichiers touchés (par l'implémenteur, pas par cette spec)

| Fichier | Nature | Réf. §|
|---------|--------|------|
| `public/api/stripe-config.example.php` | + clé `referral_coupon` | §4.5 |
| `public/api/stripe-config.php` (FTP, fondateur) | + clé `referral_coupon` réelle | §9.1 |
| `public/api/create-checkout.php` | coupon filleul + crédit parrain + metadata + fn | §4 |
| `src/Sargasses_PROD.jsx` (**autre agent**) | propagation, TTL, hub mount, copy bandeau, events | §3, §5, §6, §8 |
| `src/ChasseHome.jsx` (**autre agent**) | bloc hub « Invite un ami » dans `SpaceSheet` | §5.1 |
| Stripe dashboard (**fondateur**) | coupon `REFERRAL_FIRST_MONTH` | §9.0 |

**Aucune modif de cette spec ne touche le code A/B (`abVariant`) ni le copy sous test.** Le bandeau filleul est hors A/B ; le hub est une nouvelle surface gatée par un flag URL réversible.
