import urllib.request
import re

try:
    req = urllib.request.Request('https://sargasses-martinique.com/', headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        content = resp.read().decode('utf-8')
    js_files = re.findall(r'assets/[^\"]*\.js', content)
    for f in js_files[:5]:
        print(f)
except Exception as e:
    print(f'Error: {e}')