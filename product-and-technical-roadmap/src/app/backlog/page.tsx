import { getImprovements } from "@/lib/data";
import { SectionHead } from "@/components/ui";
import { BacklogTable } from "@/components/BacklogTable";

export const dynamic = "force-dynamic";

export default async function BacklogPage() {
  const items = await getImprovements();

  return (
    <div className="space-y-8">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">Mission 02 · regard CTO SaaS</span> — tri par ROI décroissant
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          Les <span className="italic font-serif2 font-normal text-[#c9f158]">100</span> prochaines améliorations.
        </h1>
        <p className="text-[0.9rem] text-[#8a93a1] max-w-2xl mt-4 leading-relaxed">
          Chaque item porte ses dix colonnes d'évaluation : ROI, effort, risque, revenu attendu, dette technique,
          UX, SEO, performance, IA, automatisation. Cliquez une ligne pour la justification ; changez son statut pour le piloter.
        </p>
      </section>
      <section className="reveal">
        <SectionHead index="B" sub="pilotage" title="Backlog complet" />
        <BacklogTable items={items} />
      </section>
    </div>
  );
}
