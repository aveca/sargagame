import sys

with open('.github/workflows/deploy-live.yml', 'rb') as f:
    content = f.read()

# Remove all non-ASCII bytes
cleaned = bytes([b for b in content if b < 128])

with open('.github/workflows/deploy-live.yml', 'wb') as f:
    f.write(cleaned)

import yaml
try:
    with open('.github/workflows/deploy-live.yml', 'r', encoding='utf-8') as f:
        yaml.safe_load(f)
    print('YAML VALID')
except Exception as e:
    print(f'YAML INVALID: {e}')
    sys.exit(1)

print('Done')