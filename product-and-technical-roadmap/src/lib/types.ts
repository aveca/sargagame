export type MissionStatus = "todo" | "progress" | "done";
export type ItemStatus = "todo" | "progress" | "done" | "rejected";
export type RiskLevel = "Faible" | "Moyen" | "Élevé";

export interface MissionRow {
  id: number;
  slug: string;
  ordre: number;
  title: string;
  tagline: string;
  prompt: string;
  stars: number;
  status: MissionStatus;
  progress: number;
  report: string | null;
}

export interface ImprovementRow {
  id: number;
  title: string;
  descr: string | null;
  category: string;
  mission: string;
  roi: number;
  effort: number;
  risk: RiskLevel;
  revenue: number;
  debtTech: number;
  ux: number;
  seo: number;
  perf: number;
  ai: number;
  auto: number;
  status: ItemStatus;
}

export interface StripeFindingRow {
  id: number;
  path: string;
  line: number;
  snippet: string;
  kind: string;
  used: boolean;
  deletable: string; // oui | non | partiel
  risk: RiskLevel;
  notes: string;
  handled: boolean;
}

export interface Stats {
  totalItems: number;
  doneItems: number;
  inProgressItems: number;
  rejectedItems: number;
  potentialMrr: number; // somme des revenus estimés des items restants
  capturedMrr: number; // somme des revenus des items 'done'
  avgRoi: number;
  stripeTotal: number;
  stripeHandled: number;
  stripeHighRisk: number;
  missionsDone: number;
  missionsTotal: number;
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  todo: "À faire",
  progress: "En cours",
  done: "Fait",
  rejected: "Écarté",
};

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  todo: "En attente",
  progress: "En cours",
  done: "Terminée",
};
