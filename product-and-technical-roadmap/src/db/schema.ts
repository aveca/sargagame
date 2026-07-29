import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  ordre: integer("ordre").notNull(),
  title: text("title").notNull(),
  tagline: text("tagline").notNull(),
  prompt: text("prompt").notNull(),
  stars: integer("stars").notNull().default(0),
  status: text("status").notNull().default("todo"), // todo | progress | done
  progress: integer("progress").notNull().default(0),
  report: text("report"), // rapport collé depuis Mimo
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const improvements = pgTable("improvements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  descr: text("descr"),
  category: text("category").notNull(),
  mission: text("mission").notNull(), // slug de la mission d'origine
  roi: integer("roi").notNull(), // 0-100
  effort: integer("effort").notNull(), // 1-10
  risk: text("risk").notNull(), // Faible | Moyen | Élevé
  revenue: integer("revenue").notNull().default(0), // € / mois estimé
  debtTech: integer("debt_tech").notNull().default(0),
  ux: integer("ux").notNull().default(0),
  seo: integer("seo").notNull().default(0),
  perf: integer("perf").notNull().default(0),
  ai: integer("ai").notNull().default(0),
  auto: integer("auto").notNull().default(0),
  status: text("status").notNull().default("todo"), // todo | progress | done | rejected
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stripeFindings = pgTable("stripe_findings", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),
  line: integer("line").notNull().default(1),
  snippet: text("snippet").notNull(),
  kind: text("kind").notNull(), // import | api | config | webhook | README | docs | comment | json | env | route | dead
  used: boolean("used").notNull().default(false),
  deletable: text("deletable").notNull().default("oui"), // oui | non | partiel
  risk: text("risk").notNull().default("Faible"), // Faible | Moyen | Élevé
  notes: text("notes").notNull().default(""),
  handled: boolean("handled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
