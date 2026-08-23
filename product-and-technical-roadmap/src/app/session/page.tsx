import { getMissions } from "@/lib/data";
import { SectionHead } from "@/components/ui";
import { SessionRunner } from "@/components/SessionRunner";
import { ArrowRight, ClipboardPaste, MousePointerClick, Rocket } from "lucide-react";

export const dynamic = "force-dynamic";

const PROTOCOLE = [
  {
    icon: MousePointerClick,
    title: "1 · Copier le prompt",
    desc: "Cliquez « Copier le prompt » sur la mission en cours. Un prompt = une mission, jamais deux à la fois.",
  },
  {
    icon: Rocket,
    title: "2 · Exécuter dans Mimo",
    desc: "Collez le prompt dans une session Mimo fraîche. Laissez tourner jusqu'au rapport complet — ne le coupez pas.",
  },
  {
    icon: ClipboardPaste,
    title: "3 · Coller le rapport ici",
    desc: "Le rapport revient dans la zone « Rapport Mimo » de la mission. Enregistrez, puis marquez « Terminée ».",
  },
];

export default async function SessionPage() {
  const missions = await getMissions();
  const totalEst = missions.reduce(
    (acc, m) => acc + ({ paywall: 20, "backlog-roi": 15, "dette-stripe": 10, architecture: 15, "quick-wins": 10, "audit-ia": 10, hypercroissance: 10, "master-audit": 25 }[m.slug] ?? 10),
    0
  );

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">session d'exécution</span> — une mission à la fois, dans l'ordre du plan
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          La session <span className="italic font-serif2 font-normal text-[#c9f158]">Mimo</span>, prête à coller.
        </h1>
        <p className="text-[0.9rem] text-[#8a93a1] max-w-2xl mt-4 leading-relaxed">
          Huit prompts séquencés du plus rentable au plus stratégique. ≈{" "}
          <span className="text-[#ecefe9] num">{totalEst} min</span> d'exécution cumulée.
          Chaque rapport collé ici persiste en base — le War Room devient la mémoire des audits.
        </p>
      </section>

      <section className="grid sm:grid-cols-3 gap-4 reveal">
        {PROTOCOLE.map((p) => (
          <div key={p.title} className="panel panel-hover p-5">
            <p.icon size={16} className="text-[#c9f158] mb-3" />
            <h3 className="font-semibold text-sm mb-1.5">{p.title}</h3>
            <p className="text-[0.76rem] text-[#8a93a1] leading-snug">{p.desc}</p>
          </div>
        ))}
      </section>

      <section className="reveal">
        <SectionHead
          index="S"
          sub="run list"
          title="Les 8 prompts, en séquence"
          right={<span className="chip">copier <ArrowRight size={10} className="inline" /> exécuter <ArrowRight size={10} className="inline" /> coller</span>}
        />
        <SessionRunner missions={missions} />
      </section>
    </div>
  );
}
