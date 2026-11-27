"""
Cree un package de deployment pret a etre transmis aux proprietaires des sites Sargasses.
Genere une archive ZIP contenant tous les composants, pages exemples, scripts et guides.
"""

import os
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__)).rstrip(os.sep + 'scripts')
OUTPUT_DIR = os.path.join(ROOT, 'deploy')
TIMESTAMP = datetime.now().strftime('%Y%m%d_%H%M%S')
ZIP_NAME = f"sargasses_cro_deploy_{TIMESTAMP}.zip"

# Fichiers et dossiers a inclure dans le package de deployment
INCLUDE = [
    'components/',
    'tracking/',
    'payments/stripe-links.json',
    'seo/',
    'plan/',
    'INTEGRATION_SARGASSES.md',
    'CHECKLIST_DEPLOIEMENT_SARGASSES.md',
    'EMAIL_PROPRIETAIRES_SARGASSES.md',
    'sites/sargasses/',
    'README.md',
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    zip_path = os.path.join(OUTPUT_DIR, ZIP_NAME)

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for item in INCLUDE:
            item_path = os.path.join(ROOT, item)
            if os.path.isdir(item_path):
                for root, dirs, files in os.walk(item_path):
                    for f in sorted(files):
                        full = os.path.join(root, f)
                        arc = os.path.relpath(full, ROOT)
                        zf.write(full, arc)
            elif os.path.isfile(item_path):
                arc = os.path.relpath(item_path, ROOT)
                zf.write(item_path, arc)

    size = os.path.getsize(zip_path)
    print(f"Package de deployment cree: {zip_path}")
    print(f"Taille: {size / 1024:.1f} Ko")
    print(f"Ce ZIP est pret a etre transmis aux proprietaires des sites Sargasses.")
    print(f"Guide d'integration inclus: INTEGRATION_SARGASSES.md")


if __name__ == '__main__':
    main()
