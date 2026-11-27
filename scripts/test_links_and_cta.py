# -*- coding: utf-8 -*-
"""
Verifie la coherence des liens et attributs de tracking sur toutes les pages Sargasses.
"""

import os
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__)).rstrip(os.sep + 'scripts')
SARGASS_DIR = os.path.join(ROOT, 'sites', 'sargasses')


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ctas = []
        self.links = []
        self.scripts = []
        self.has_gdpr_banner = False
        self.body_data_site = None
        self._in_a = False

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'body':
            self.body_data_site = d.get('data-site')
        if tag == 'a':
            self._in_a = True
            self.links.append({
                'href': d.get('href', ''),
                'data_cta': d.get('data-cta'),
                'data_page': d.get('data-page'),
                'data_site': d.get('data-site'),
                'text': '',
            })
            if d.get('data-cta'):
                self.ctas.append(d.get('data-cta'))
        if tag == 'script':
            self.scripts.append(d.get('src', ''))
        if tag == 'div' and 'gdpr-banner' in d.get('class', ''):
            self.has_gdpr_banner = True

    def handle_endtag(self, tag):
        if tag == 'a':
            self._in_a = False

    def handle_data(self, data):
        if self._in_a and self.links:
            self.links[-1]['text'] += data.strip()


def test_page(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    p = LinkParser()
    p.feed(content)
    return p


def main():
    results = []
    for root, dirs, files in os.walk(SARGASS_DIR):
        for f in sorted(files):
            if not f.endswith('.html'):
                continue
            path = os.path.join(root, f)
            p = test_page(path)
            issues = []

            for link in p.links:
                if link['href'] and not link['href'].startswith(('http', 'mailto', '#')):
                    target = os.path.normpath(os.path.join(os.path.dirname(path), link['href']))
                    if not os.path.exists(target):
                        issues.append('Lien interne casse: ' + link['href'])

                if link['data_cta'] and not (link['data_page'] and link['data_site']):
                    issues.append('CTA incomplet: ' + str(link['data_cta']) + ' (page/site manquant)')

            if not any('consent-manager' in s for s in p.scripts):
                issues.append('Script consent-manager.js manquant')
            if not any('events.js' in s for s in p.scripts):
                issues.append('Script events.js manquant')

            if not p.has_gdpr_banner:
                issues.append('Bandeau RGPD manquant')

            if not p.body_data_site:
                issues.append('Attribut data-site manquant sur <body>')

            results.append({
                'file': os.path.relpath(path, ROOT),
                'ctas': p.ctas,
                'links': p.links,
                'issues': issues,
            })

    print('=' * 70)
    print('TEST DES LIENS ET CTA - SARGASSSES')
    print('=' * 70)

    total_issues = 0
    for r in results:
        if r['issues']:
            total_issues += len(r['issues'])
            print('[ISSUES] ' + r['file'])
            for i in r['issues']:
                print('   ! ' + i)
        else:
            print('[OK] ' + r['file'] + ' (' + str(len(r['ctas'])) + ' CTA, ' + str(len(r['links'])) + ' liens)')

    print()
    print('=' * 70)
    print('TOTAL: ' + str(len(results)) + ' pages verifiees | ' + str(total_issues) + ' probleme detecte(s)')
    print('=' * 70)

    return 1 if total_issues > 0 else 0


if __name__ == '__main__':
    raise SystemExit(main())
