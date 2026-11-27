# -*- coding: utf-8 -*-
"""
Script de deploiement CRO sur les sites Sargasses locaux (copies FTP).
Copie les composants et modifie chaque page HTML :
  - Lien CSS cta-styles.css dans <head>
  - Attribut data-site sur <html> et <body>
  - Bandeau RGPD avant </body>
  - Scripts consent-manager.js + events.js avant </body>
  - CTA boutons sur pages carte et fiabilite
Ne modifie PAS les prix de la page offres.
"""

import os
import re
import shutil

CRO_IMPL = r"C:\Users\user\Documents\money\cro-implementation"
FTP_BASE = r"C:\Users\user\sargagame-tmp"

# Mapping dossier FTP -> valeur data-site
REGIONS = {
    "martinique-ftp": "sargasses_martinique",
    "guadeloupe-ftp": "sargasses_guadeloupe",
    "puntacana-ftp": "sargasses_puntacana",
    "tulum-ftp": "sargasses_tulum",
    "rivieramaya-ftp": "sargasses_rivieramaya",
    "florida-ftp": "sargasses_florida",
}

# Composants a copier : source dans cro-implementation -> destination sur le site FTP
COMPONENTS = {
    os.path.join(CRO_IMPL, "components", "cta-styles.css"): "components/cta-styles.css",
    os.path.join(CRO_IMPL, "tracking", "consent-manager.js"): "js/consent-manager.js",
    os.path.join(CRO_IMPL, "tracking", "events.js"): "js/events.js",
}

# Bandeau RGPD / CNIL
GDPR_BANNER = """<!-- Bandeau consentement RGPD / CNIL — insérer avant </body> -->
<div class="gdpr-banner" id="gdpr-banner" role="dialog" aria-modal="true" aria-label="Préférences de confidentialité">
  <div class="gdpr-content">
    <div class="gdpr-text">
      <strong>Nous utilisons des cookies pour mesurer l'audience et améliorer votre expérience.</strong><br>
      Certains partenaires déposent des cookies pour des mesures d'audience personnalisées. Vous pouvez accepter ou personnaliser vos choix.
    </div>
    <div class="gdpr-actions">
      <button class="gdpr-btn gdpr-btn-accept" id="gdpr-accept">Accepter</button>
      <button class="gdpr-btn gdpr-btn-decline" id="gdpr-decline">Refuser</button>
      <button class="gdpr-btn gdpr-btn-settings" id="gdpr-settings">Paramétrer</button>
    </div>
  </div>
</div>"""

# Scripts de tracking
TRACKING_SCRIPTS = '<script src="/js/consent-manager.js"></script>\n<script src="/js/events.js"></script>'

# Lien CSS
CSS_LINK = '<link rel="stylesheet" href="/components/cta-styles.css">'


def add_data_site(html, data_site):
    """Ajoute data-site sur <html> et <body> si absent."""
    if 'data-site' in html:
        return html, False
    modified = False
    # Sur <html>
    html, n = re.subn(
        r'<html[^>]*>',
        lambda m: m.group(0).rstrip('>') + f' data-site="{data_site}"',
        html, count=1
    )
    if n > 0:
        modified = True
    # Sur <body>
    html, n = re.subn(
        r'<body[^>]*>',
        lambda m: m.group(0).rstrip('>') + f' data-site="{data_site}"',
        html, count=1
    )
    if n > 0:
        modified = True
    return html, modified


def add_css_link(html):
    """Ajoute le lien CSS dans <head> avant </head> si absent."""
    if 'cta-styles.css' in html:
        return html, False
    html = html.replace('</head>', CSS_LINK + '\n</head>', 1)
    return html, True


def add_gdpr_and_tracking(html):
    """Insere bandeau RGPD et scripts tracking avant </body> si absent."""
    if 'gdpr-banner' in html:
        return html, False
    insertion = GDPR_BANNER + '\n' + TRACKING_SCRIPTS + '\n'
    html = html.replace('</body>', insertion + '</body>', 1)
    return html, True


def add_cta_carte(html, data_site):
    """Ajoute les CTA sur la page carte."""
    if 'cta_sarg_alert' in html:
        return html, False
    ctas = f'''
<!-- CTA CRO — Page carte -->
<a href="/alertes/" class="cta-btn" data-cta="cta_sarg_alert" data-page="carte" data-site="{data_site}">
  Activer Le Veilleur — 7j gratuits
</a>
<a href="/offres/" class="cta-inline" data-cta="cta_sarg_offres" data-page="carte" data-site="{data_site}">
  Voir nos offres Pass & Pro
</a>
<div class="cta-sticky" id="cta-sticky-mobile" aria-label="Bouton d'action rapide">
  <span class="cta-sticky-text">Ne manquez plus aucun changement sur votre plage.</span>
  <a href="/alertes/" class="cta-btn" data-cta="cta_sarg_alert_sticky" data-page="carte" data-site="{data_site}">
    Alertes gratuites
  </a>
</div>
'''
    # Insert before </body>
    html = html.replace('</body>', ctas + '</body>', 1)
    return html, True


def add_cta_fiabilite(html, data_site):
    """Ajoute un CTA sur la page fiabilite."""
    if 'cta_sarg_offres_fiabilite' in html:
        return html, False
    cta = f'''
<!-- CTA CRO — Page fiabilite -->
<a href="/offres/" class="cta-btn" data-cta="cta_sarg_offres_fiabilite" data-page="fiabilite" data-site="{data_site}">
  Voir nos Pass
</a>
'''
    html = html.replace('</body>', cta + '</body>', 1)
    return html, True


def process_html_file(filepath, data_site, is_carte, is_fiabilite, is_offres):
    """Traite un fichier HTML unique."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    # 1. CSS link
    content, ch = add_css_link(content)
    if ch:
        changes.append('CSS')

    # 2. data-site
    content, ch = add_data_site(content, data_site)
    if ch:
        changes.append('data-site')

    # 3. RGPD + tracking
    content, ch = add_gdpr_and_tracking(content)
    if ch:
        changes.append('RGPD+tracking')

    # 4. CTA (sauf offres — pas de modification des prix)
    if not is_offres:
        if is_carte:
            content, ch = add_cta_carte(content, data_site)
            if ch:
                changes.append('CTA-carte')
        elif is_fiabilite:
            content, ch = add_cta_fiabilite(content, data_site)
            if ch:
                changes.append('CTA-fiabilite')

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes
    return []


def classify_page(rel_path):
    """Classifie une page par son chemin relatif."""
    lp = rel_path.lower()
    if 'offres' in lp:
        return {'is_offres': True, 'is_carte': False, 'is_fiabilite': False}
    if 'carte' in lp or 'carte-sargasses' in lp:
        return {'is_offres': False, 'is_carte': True, 'is_fiabilite': False}
    if 'fiabilite' in lp:
        return {'is_offres': False, 'is_carte': False, 'is_fiabilite': True}
    return {'is_offres': False, 'is_carte': False, 'is_fiabilite': False}


def main():
    total_modified = 0

    for ftp_dir, data_site in REGIONS.items():
        ftp_path = os.path.join(FTP_BASE, ftp_dir)
        if not os.path.isdir(ftp_path):
            print(f"[SKIP] Dossier introuvable: {ftp_path}")
            continue

        print(f"\n{'=' * 70}")
        print(f"DEPLOIEMENT: {ftp_dir} (data-site={data_site})")
        print(f"{'=' * 70}")

        # 1. Copier les composants
        for src, dest in COMPONENTS.items():
            dest_path = os.path.join(ftp_path, dest)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            shutil.copy2(src, dest_path)
            print(f"  [COPY] {os.path.basename(src)} -> {dest}")

        # 2. Traiter tous les fichiers HTML
        html_files = []
        for root, dirs, files in os.walk(ftp_path):
            for f in sorted(files):
                if f.endswith('.html'):
                    html_files.append(os.path.join(root, f))

        region_modified = 0
        for html_path in html_files:
            rel_path = os.path.relpath(html_path, ftp_path)
            page_type = classify_page(rel_path)
            changes = process_html_file(
                html_path,
                data_site,
                is_carte=page_type['is_carte'],
                is_fiabilite=page_type['is_fiabilite'],
                is_offres=page_type['is_offres'],
            )
            if changes:
                region_modified += 1
                total_modified += 1
                print(f"  [MOD] {rel_path} -> {', '.join(changes)}")

        print(f"  Pages modifiees dans {ftp_dir}: {region_modified} / {len(html_files)}")

    print(f"\n{'=' * 70}")
    print(f"DEPLOIEMENT TERMINE: {total_modified} pages modifiees au total")
    print(f"{'=' * 70}")


if __name__ == '__main__':
    main()