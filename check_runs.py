import json
import subprocess

result = subprocess.run(['gh', 'api', 'repos/aveca/sargagame/actions/runs'], capture_output=True, text=True)
data = json.loads(result.stdout)

for r in data['workflow_runs']:
    prs = r.get('pull_requests', [])
    if prs and prs[0]['number'] == 673:
        print(f"{r['name']} | {r.get('conclusion', 'running')} | {r['head_sha'][:8]} | PR #{prs[0]['number']}")