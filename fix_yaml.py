with open('.github/workflows/deploy-live.yml', 'rb') as f:
    content = f.read()
print('Length:', len(content))
non_ascii = [(i, b) for i, b in enumerate(content) if b > 127]
print(f'Found {len(non_ascii)} non-ASCII bytes')
if non_ascii:
    for i, b in non_ascii[:10]:
        print(f'  Position {i}: byte={hex(b)}')
    # Fix encoding
    content = content.replace(b'\x8f', b'\xc3\xa9')
    content = content.replace(b'\xe9', b'\xc3\xa9')
    content = content.replace(b'\xe8', b'\xc3\xa8')
    content = content.replace(b'\xe0', b'\xc3\xa0')
    content = content.replace(b'\xfb', b'\xc3\xbb')
    content = content.replace(b'\xe2', b'\xc3\xa2')
    content = content.replace(b'\xe7', b'\xc3\xa7')
    content = content.replace(b'\xee', b'\xc3\xae')
    content = content.replace(b'\xea', b'\xc3\xaa')
    content = content.replace(b'\xef', b'\xc3\xaf')
    content = content.replace(b'\xf4', b'\xc3\xb4')
    content = content.replace(b'\xf9', b'\xc3\xb9')
    content = content.replace(b'\xe7', b'\xc3\xa7')
    content = content.replace(b'\xea', b'\xc3\xaa')
    with open('.github/workflows/deploy-live.yml', 'wb') as f:
        f.write(content)
    print('Fixed')
else:
    print('No non-ASCII bytes found')
# Verify
import yaml
try:
    with open('.github/workflows/deploy-live.yml', 'r', encoding='utf-8') as f:
        yaml.safe_load(f)
    print('YAML VALID')
except Exception as e:
    print(f'YAML INVALID: {e}')
    sys.exit(1)
print('Done')