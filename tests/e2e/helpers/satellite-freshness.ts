import type { Page } from "@playwright/test"

/**
 * PRÉCONDITION DÉTERMINISTE pour les tests qui pilotent la carte (labels,
 * pins, verdict par plage).
 *
 * Pourquoi : la carte ne peint un VERDICT par plage — et donc les labels
 * `.sg-maplabel` et le CTA « voir les 7 jours » de la fiche — que si
 * l'observation satellite a MOINS DE 12 h (`src/lib/world-map-freshness.mjs` :
 * `available = age < 12`). NOAA ne publie qu'UNE fois par jour (12:00Z) : la
 * fenêtre 12:00Z→03:00Z laisse la donnée entre 12 et 36 h, état dans lequel
 * le produit affiche honnêtement « à vérifier » (pin gris, aucun label).
 *
 * Conséquence AVANT ce helper : ces tests n'étaient verts que pendant la
 * fenêtre de fraîcheur satellite, et rouges le reste du temps — un défaut
 * pré-existant du harnais, pas du produit (reproduit à l'identique sur le
 * build de référence).
 *
 * Ce helper sert la charge utile RÉELLE du build, avec un horodatage ERDDAP
 * « maintenant ». Il ne fabrique aucune donnée de verdict : les statuts par
 * plage, les scores et les grilles restent ceux du build servi. Seule la
 * horloge de l'observation est alignée sur le test.
 */
export async function stubFreshSatellite(page: Page) {
  await page.route("**/api/copernicus/sargassum.json*", async (route) => {
    const response = await route.fetch()
    let body: any = {}
    try {
      body = await response.json()
    } catch (_) {
      body = {}
    }
    const nowIso = new Date().toISOString()
    body.source = "erddap-live"
    body.erddapTimestamp = nowIso
    body.updatedAt = nowIso
    body.stale = false
    await route.fulfill({ response, json: body })
  })
}
