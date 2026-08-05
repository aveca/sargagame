export interface StripeFindingSeed {
  path: string;
  line: number;
  snippet: string;
  kind: "import" | "api" | "config" | "webhook" | "README" | "docs" | "comment" | "json" | "env" | "route" | "dead";
  used: boolean;
  deletable: "oui" | "non" | "partiel";
  risk: "Faible" | "Moyen" | "Élevé";
  notes: string;
}

export const STRIPE_SEEDS: StripeFindingSeed[] = [
  { path: "src/lib/stripe.ts", line: 1, snippet: `import Stripe from "stripe"`, kind: "dead", used: false, deletable: "oui", risk: "Faible", notes: "Module entier mort depuis la migration Mollie. Aucun import résolu dans l'app." },
  { path: "package.json", line: 34, snippet: `"stripe": "^14.21.0"`, kind: "json", used: false, deletable: "oui", risk: "Faible", notes: "Retirer la dépendance + régénérer le lockfile : -2,1 Mo installés, surface CVE réduite." },
  { path: ".env.example", line: 12, snippet: "STRIPE_SECRET_KEY=sk_test_…", kind: "env", used: false, deletable: "oui", risk: "Faible", notes: "Induit en erreur tout nouveau dev : indique un double système de paiement." },
  { path: ".env (local)", line: 9, snippet: "STRIPE_WEBHOOK_SECRET=whsec_…", kind: "env", used: false, deletable: "partiel", risk: "Moyen", notes: "Vérifier d'abord qu'aucun environnement de prod/hébergement ne le définit encore." },
  { path: "src/app/api/webhooks/stripe/route.ts", line: 1, snippet: `export async function POST(req: Request)`, kind: "webhook", used: false, deletable: "oui", risk: "Moyen", notes: "Endpoint public encore monté : supprimer après 30 j d'observation d'absence de trafic Stripe." },
  { path: "src/app/api/checkout/stripe/route.ts", line: 1, snippet: `const session = await stripe.checkout.sessions.create(...)`, kind: "route", used: false, deletable: "oui", risk: "Faible", notes: "Non référencée dans l'UI. Garder un redirect 410 → /api/checkout/mollie pendant 90 j." },
  { path: "src/server/payments/providers.ts", line: 41, snippet: `if (provider === "stripe") { ... }`, kind: "dead", used: false, deletable: "partiel", risk: "Moyen", notes: "Branche jamais empruntée (provider codé en dur 'mollie'). Simplifier la factory en provider unique." },
  { path: "src/server/payments/reconcile.ts", line: 18, snippet: `const stripeEvents = await db.select().from(stripe_events)`, kind: "api", used: true, deletable: "partiel", risk: "Élevé", notes: "Réconciliation multi-providers : extraire l'archive Stripe dans un export figé avant suppression." },
  { path: "src/db/schema.ts", line: 88, snippet: `export const stripeEvents = pgTable("stripe_events", ...)`, kind: "api", used: true, deletable: "non", risk: "Élevé", notes: "Contient l'historique de paiements B2C pré-migration : obligation comptable 10 ans." },
  { path: "drizzle/migrations/0008_stripe_events.sql", line: 1, snippet: "CREATE TABLE stripe_events (…)", kind: "config", used: true, deletable: "non", risk: "Élevé", notes: "Historique de migrations read-only : ne jamais réécrire." },
  { path: "README.md", line: 57, snippet: "### Paiement (Stripe)", kind: "README", used: false, deletable: "oui", risk: "Faible", notes: "Documente le checkout Stripe obsolète : réécrire la section sur Mollie." },
  { path: "docs/paiement.md", line: 4, snippet: "## Webhooks Stripe", kind: "docs", used: false, deletable: "oui", risk: "Faible", notes: "Section entièrement obsolète ; conserver un encart « Historique : Stripe jusqu'à 2025 »." },
  { path: "docs/runbook-incidents.md", line: 22, snippet: "Incident : stripe outages → bascule …", kind: "docs", used: false, deletable: "partiel", risk: "Faible", notes: "Remplacer par la procédure Mollie équivalente (status page, retry webhooks)." },
  { path: "src/emails/receipt.tsx", line: 63, snippet: `<a href={stripePortalUrl}>Gérer mon abonnement</a>`, kind: "dead", used: false, deletable: "partiel", risk: "Moyen", notes: "Prop jamais fournie (lien vide rendu) : brancher le portail Mollie ou supprimer le lien." },
  { path: "src/components/BillingPortalButton.tsx", line: 1, snippet: "export function BillingPortalButton()", kind: "dead", used: false, deletable: "oui", risk: "Faible", notes: "Composant orphelin post-migration ; aucun import restant." },
  { path: "src/app/(marketing)/pricing/page.tsx", line: 2, snippet: `// import { stripePrices } from "@/lib/stripe"`, kind: "comment", used: false, deletable: "oui", risk: "Faible", notes: "Commentaire vestigial dans la page de pricing : supprimer pour éviter toute confusion SEO/produit." },
  { path: "scripts/backfill_stripe_customers.mjs", line: 1, snippet: "node script one-shot de backfill", kind: "dead", used: false, deletable: "oui", risk: "Faible", notes: "Script migration exécuté une fois : archiver hors du repo (vault interne)." },
  { path: ".github/workflows/ci.yml", line: 45, snippet: "STRIPE_TEST_KEY: ${{ secrets.STRIPE_TEST_KEY }}", kind: "config", used: false, deletable: "oui", risk: "Faible", notes: "Secret toujours injecté en CI : retirer du workflow + purger le secret GitHub." },
  { path: "src/lib/payments.ts", line: 7, snippet: "TODO(migration-stripe): supprimer après bascule", kind: "comment", used: false, deletable: "oui", risk: "Faible", notes: "TODO daté de la migration : la bascule est faite, fermer la boucle." },
  { path: "tests/e2e/checkout.stripe.spec.ts", line: 1, snippet: `test.describe("checkout stripe", ...)`, kind: "dead", used: false, deletable: "oui", risk: "Faible", notes: "Suite e2e skippée depuis 6 mois : remplacer par checkout.mollie.spec.ts (mode test)." },
  { path: "src/app/api/health/route.ts", line: 11, snippet: `ok: Boolean(process.env.STRIPE_SECRET_KEY) && dbOk`, kind: "api", used: true, deletable: "partiel", risk: "Moyen", notes: "Healthcheck couplé à une env morte : un déploiement sans la clé semblerait en échec." },
  { path: "public/legal/cgv.html", line: 88, snippet: "Paiement traité par Stripe, Inc.", kind: "docs", used: true, deletable: "partiel", risk: "Élevé", notes: "Mention légale active et FAUSSE : corriger en priorité — le prestataire réel est Mollie B.V." },
  { path: "src/server/flags.ts", line: 19, snippet: `billing_stripe: false`, kind: "config", used: false, deletable: "oui", risk: "Faible", notes: "Flag figé à false : supprimer le flag et ses branches conditionnelles." },
  { path: "drizzle/migrations/0003_init.sql", line: 14, snippet: "stripe_customer_id text", kind: "config", used: true, deletable: "non", risk: "Élevé", notes: "Colonne historique encore jointe dans exports comptables : conserver, documenter comme legacy." },
  { path: "src/app/admin/refunds/page.tsx", line: 102, snippet: `if (sub.provider === "stripe") return stripeRefunds...`, kind: "api", used: true, deletable: "partiel", risk: "Élevé", notes: "Nécessaire pour rembourser les anciens abonnés Stripe encore actifs : garder jusqu'à extinction du parc, date cible à fixer." },
  { path: "docs/ARCHITECTURE.md", line: 31, snippet: "Payments: Stripe (legacy) → Mollie", kind: "docs", used: false, deletable: "partiel", risk: "Faible", notes: "Mettre à jour le schéma du provider de paiement dans le diagramme." },
];

export const STRIPE_KINDS = ["import", "api", "config", "webhook", "README", "docs", "comment", "json", "env", "route", "dead"] as const;
