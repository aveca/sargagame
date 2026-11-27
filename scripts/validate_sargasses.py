"""
Script de validation complete des fichiers Sargasses.
Verifie la structure HTML, les attributs de tracking, les liens Stripe et le bandeau RGPD.
"""

import os
import re
import json
from html.parser import HTMLParser

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)  # cro-implementation/

class HTMLValidator(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
        self.void = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                     'link', 'meta', 'param', 'source', 'track', 'wbr'}
        self.ctas = []
        self.has_gdpr = False
        self.has_consent_js = False
        self.has_events_js = False
        self.stripe_links = []
        self.body_has_data_site = False

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        if tag not in self.void:
            self.stack.append(tag)

        if tag == 'body':
            if 'data-site' in attr_dict:
                self.body_has_data_site = True

        if tag == 'a':
            if 'data-cta' in attr_dict:
                self.ctas.append({
                    'cta': attr_dict.get('data-cta'),
                    'page': attr_dict.get('data-page'),
                    'site': attr_dict.get('data-site'),
                    'href': attr_dict.get('href', ''),
                    'text': ''
                })
            href = attr_dict.get('href', '')
            if 'stripe' in href or 'buy.stripe' in href:
                self.stripe_links.append(href)

        if tag == 'script':
            src = attr_dict.get('src', '')
            if 'consent-manager' in src:
                self.has_consent_js = True
            if 'events.js' in src:
                self.has_events_js = True

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        else:
            self.errors.append(f"Fermeture de {tag} sans ouverture correspondante")

    def handle_data(self, data):
        # Remplir le texte des CTA pour le dernier <a> ouvert
        if self.ctas and self.stack and self.stack[-1] == 'a':
            self.ctas[-1]['text'] += data.strip()

    def handle_comment(self, data):
        if 'gdpr-banner' in data or 'Bandeau consentement' in data or 'rgpd' in data.lower():
            self.has_gdpr = True


def validate_file(path):
    """Valide un fichier HTML individuel."""
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    v = HTMLValidator()
    v.feed(content)

    # Balises non fermees
    unclosed = [t for t in v.stack if t not in v.void]
    if unclosed:
        v.errors.append(f"Balises non fermees: {unclosed}")

    return {
        'file': os.path.relpath(path, ROOT),
        'errors': v.errors,
        'ctas': v.ctas,
        'stripe_links': v.stripe_links,
        'has_gdpr': v.has_gdpr,
        'has_consent_js': v.has_consent_js,
        'has_events_js': v.has_events_js,
        'body_has_data_site': v.body_has_data_site,
        'error_count': len(v.errors) + len(unclosed),
    }


def main():
    sargasses_dir = os.path.join(ROOT, 'sites', 'sargasses')
    results = []

    for root, dirs, files in os.walk(sargasses_dir):
        for f in sorted(files):
            if f.endswith('.html'):
                path = os.path.join(root, f)
                results.append(validate_file(path))

    print("=" * 70)
    print("VALIDATION SITES SARGASSSES")
    print("=" * 70)
    print(f"Fichiers valides: {len(results)}")
    print()

    all_ok = True
    for r in results:
        status = "OK" if r['error_count'] == 0 else "ERREURS"
        if r['error_count'] > 0:
            all_ok = False
        print(f"[{status}] {r['file']}")
        if r['errors']:
            for e in r['errors']:
                print(f"      ! {e}")
        print(f"      CTA: {len(r['ctas'])} | Stripe: {len(r['stripe_links'])} | "
              f"RGPD: {r['has_gdpr']} | consent.js: {r['has_consent_js']} | "
              f"events.js: {r['has_events_js']} | data-site: {r['body_has_data_site']}")

    print()
    print("=" * 70)
    print("RESULTAT GLOBAL:", "TOUT EST VALIDE" if all_ok else "ERREURS DETECTEES")
    print("=" * 70)

    # Verification des liens Stripe TEST
    stripe_json_path = os.path.join(ROOT, 'payments', 'stripe-links.json')
    if os.path.exists(stripe_json_path):
        with open(stripe_json_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        print("\nLiens Stripe configures dans stripe-links.json:")
        for site, produits in config.items():
            if site == 'comment':
                continue
            for key, prod in produits.items():
                link = prod.get('stripe_link', '')
                is_test = 'TEST' in link
                print(f"  {site}/{key}: {link} ({'TEST' if is_test else 'PRODUCTION'})")

    return 0 if all_ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
