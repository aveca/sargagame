import Link from "next/link";
import { getMissions, getImprovements, getStripeFindings, getStats } from "@/lib/data";
import { Panel, SectionHead, ScoreBar, RiskBadge } from "@/components/ui";
import { MissionDeck } from "@/components/MissionDeck";
import { GaugeMrr } from "@/components/GaugeMrr";
import { FunnelViz } from "@/components/FunnelViz";
import { CountUp } from "@/components/CountUp";
import { ArrowRight, Crosshair, AlertOctagon, FileWarning, Flame, Rocket } from "lucide-react";
import { TRAJECTOIRE } from "@/lib/seed/master";

export const dynamic = "force-dynamic";

export default async function WarRoomPage() {
  const [missions, items, stripe, stats] = await Promise.all([
    getMissions(),
    getImprovements(),
    getStripeFindings(),
    getStats(),
  ]);
  const top10 = items.slice(0, 10);
  const urgentStripe = stripe.filter((s) => s.risk === "Élevé" && !s.handled).slice(0, 4);

  return (
    <div className="space-y-14">
      {/* ─── HERO ─── */}
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">SARGA·OPS</span> — plan d'exécution · audit priorisé · zéro micro-refactor
        </p>
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 items-end">
          <h1 className="text-[clamp(2.6rem,6.5vw,5.2rem)] font-semibold leading-[0.95] tracking-tight">
            De <span className="text-[#8a93a1] line-through decoration-[#ff6b5b]/70 decoration-2">71&nbsp;€</span> à{" "}
            <span className="italic font-serif2 font-normal text-[#c9f158] glow-lime">10&nbsp;000&nbsp;€</span>
            <br />
            de MRR.
          </h1>
          <p className="text-[0.95rem] text-[#8a93a1] leading-relaxed max-w-md">
            Centre de commandement des 8 missions d'audit. Priorité absolue : le funnel{" "}
            <span className="text-[#ecefe9]">Carte → Fiche plage → PremiumModal → PassOffer → Checkout Mollie</span>.
            Chaque amélioration est classée par ROI, chaque risque est tracé, chaque statut persiste en base.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 mt-8 items-center">
          {[
            { v: stats.missionsTotal, l: "missions cadrées" },
            { v: stats.totalItems, l: "améliorations classées ROI" },
            { v: stats.stripeTotal, l: "références Stripe inventoriées" },
            { v: stats.potentialMrr, suffix: " €", l: "de MRR potentiel identifié" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-3xl font-semibold num">
                <CountUp value={s.v} suffix={s.suffix ?? ""} />
              </p>
              <p className="text-[0.68rem] font-mono uppercase tracking-widest text-[#4a5261] mt-1">{s.l}</p>
            </div>
          ))}
          <div className="ml-auto flex flex-col sm:flex-row gap-3">
            <Link
              href="/session"
              className="inline-flex items-center gap-2 rounded-xl border border-[#c9f158]/40 bg-[#c9f158]/10 px-5 py-3 text-sm font-semibold text-[#c9f158] hover:bg-[#c9f158]/20 transition-colors"
            >
              <Rocket size={15} />
              Lancer la session Mimo
            </Link>
            <Link
              href="/paywall"
              className="inline-flex items-center gap-2 rounded-xl bg-[#c9f158] px-5 py-3 text-sm font-semibold text-[#05070a] hover:bg-[#d8ff70] transition-colors"
            >
              <Crosshair size={15} />
              Mission n°1 : le paywall
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── JAUGE + TRAJECTOIRE ─── */}
      <section className="grid lg:grid-cols-2 gap-4 reveal">
        <Panel className="p-6">
          <p className="kicker mb-4">Trajectoire MRR</p>
          <GaugeMrr captured={stats.capturedMrr} />
        </Panel>
        <div className="grid gap-4">
          {TRAJECTOIRE.map((p) => (
            <Panel key={p.phase} hover className="p-4 flex items-center gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.04] border hairline font-mono text-sm text-[#c9f158]">
                P{p.phase}
              </span>
              <div className="min-w-0 grow">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-sm truncate">{p.nom}</h3>
                  <span className="font-mono text-[0.7rem] text-[#62e6c8] num shrink-0">{p.mrrCible.toLocaleString("fr-FR")} €</span>
                </div>
                <p className="text-[0.68rem] font-mono text-[#4a5261] mt-0.5">{p.periode}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.leviers.map((l) => (
                    <span key={l} className="chip !py-0.5 !text-[0.58rem]">{l}</span>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* ─── FUNNEL SNAPSHOT ─── */}
      <section className="reveal">
        <SectionHead
          index="00"
          sub="priorité absolue"
          title="Le funnel de vente mesuré"
          right={
            <Link href="/paywall" className="link-underline text-sm text-[#c9f158] inline-flex items-center gap-1.5">
              Audit paywall complet <ArrowRight size={13} />
            </Link>
          }
        />
        <Panel className="p-6">
          <div className="mb-4 flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-[#ff6b5b]" />
              <p className="text-sm text-[#8a93a1]">
                Conversion globale : <span className="num font-semibold text-[#ff6b5b]">0,12 %</span>{" "}
                <span className="text-[#4a5261] font-mono text-[0.7rem]">(11 acheteurs / 9 000 sessions)</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AlertOctagon size={14} className="text-[#ffb84d]" />
              <p className="text-sm text-[#8a93a1]">
                4 clics entre le désir et le paiement — <span className="text-[#ecefe9]">1 de trop</span>
              </p>
            </div>
          </div>
          <FunnelViz compact />
        </Panel>
      </section>

      {/* ─── MISSIONS ─── */}
      <section className="reveal">
        <SectionHead
          index="01"
          sub="une mission à la fois"
          title="Les 8 missions Mimo"
        />
        <MissionDeck missions={missions} />
      </section>

      {/* ─── TOP ROI + STRIPE URGENT ─── */}
      <section className="grid lg:grid-cols-[1.5fr_1fr] gap-4 reveal">
        <div>
          <SectionHead
            index="02"
            sub="tri roi décroissant"
            title="Top 10 du backlog"
            right={
              <Link href="/backlog" className="link-underline text-sm text-[#c9f158] inline-flex items-center gap-1.5">
                Les 100 items <ArrowRight size={13} />
              </Link>
            }
          />
          <Panel className="divide-y divide-[#1b2230]">
            {top10.map((it, i) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-[0.62rem] text-[#4a5261] num w-7">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 grow">
                  <p className="text-[0.82rem] font-medium truncate">{it.title}</p>
                  <div className="mt-1">
                    <ScoreBar value={it.roi} />
                  </div>
                </div>
                <span className="num font-semibold text-sm text-[#c9f158] w-8 text-right">{it.roi}</span>
                <span className="num text-[0.7rem] text-[#62e6c8] w-16 text-right hidden sm:block">
                  {it.revenue > 0 ? `+${it.revenue} €` : "—"}
                </span>
              </div>
            ))}
          </Panel>
        </div>
        <div>
          <SectionHead
            index="03"
            sub="sécurité & fiabilité"
            title="Dette Stripe à risque"
            right={
              <Link href="/stripe" className="link-underline text-sm text-[#c9f158] inline-flex items-center gap-1.5">
                Inventaire <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="space-y-3">
            <Panel className="p-4 flex items-center gap-4">
              <FileWarning size={20} className="text-[#ff6b5b] shrink-0" />
              <div>
                <p className="text-sm font-semibold num">
                  {stats.stripeHighRisk} références à risque élevé non traitées
                </p>
                <p className="text-[0.7rem] text-[#8a93a1]">dont une mention CGV légalement fausse</p>
              </div>
            </Panel>
            {urgentStripe.map((s) => (
              <Panel key={s.id} hover className="p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="font-mono text-[0.7rem] text-[#ecefe9] break-all">{s.path}<span className="text-[#4a5261]">:{s.line}</span></p>
                  <RiskBadge risk={s.risk} />
                </div>
                <p className="text-[0.74rem] text-[#8a93a1] leading-snug">{s.notes}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
