#!/usr/bin/env python3
import sys

with open('.github/workflows/deploy-live.yml', 'rb') as f:
    content = f.read()

# Find all non-ASCII bytes
non_ascii = [(i, b) for i, b in enumerate(content) if b > 127]
print(f"Found {len(non_ascii)} non-ASCII bytes")

# Replace common French characters
replacements = {
    0x8f: b'\xc3\xa9',  # é
    0xe9: b'\xc3\xa9',  # é
    0xe8: b'\xc3\xa8',  # è
    0xe0: b'\xc3\xa0',  # à
    0xfb: b'\xc3\xbb',  # û
    0xe2: b'\xc3\xa2',  # â
    0xe7: b'\xc3\xa7',  # ç
    0xee: b'\xc3\xae',  # î
    0xea: b'\xc3\xaa',  # ê
    0xef: b'\xc3\xaf',  # ï
    0xf4: b'\xc3\xb4',  # ô
    0xf9: b'\xc3\xb9',  # ù
    0xe7: b'\xc3\xa7',  # ç
}

content = bytearray(content)
for i, b in enumerate(content):
    if b > 127:
        if b in replacements:
            content[i:i+1] = replacements[b]
            print(f'Position {i}: replaced {hex(b)} with {replacements[b]}')
        else:
            print(f'Position {i}: unknown byte {hex(b)} - removing')
            content[i:i+1] = b''

with open('.github/workflows/deploy-live.yml', 'wb') as f:
    f.write(content)

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