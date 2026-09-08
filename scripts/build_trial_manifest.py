"""Bind retained synthetic screenshots and the packaged local trial by exact bytes."""
from pathlib import Path
import hashlib
from ic_evidence_lab.canonical import canonical_json

root = Path(__file__).resolve().parents[1]
folders = ['design-rebuild-20260903','goal-one-20260908','goal-two-20260908','desk-twelve-20260908','deal-progress-20260908']
paths = sorted(p for folder in folders for p in (root/'verification'/folder).rglob('*.png'))
paths.append(root/'trial/underwriting-desk-local.zip')
paths.append(root/'verification/goal-one-20260908/goal-one-working-walkthrough.webm')
body = {'schema':'desk.local-trial-artifacts/v1','scope':'Retained synthetic application screenshots and a local trial package; byte integrity, not practitioner validation or a publisher signature. Earlier screenshot sets are historical and are not represented as the current UI.','files':[{'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
body['manifest_sha256'] = hashlib.sha256(canonical_json(body)).hexdigest()
(root/'verification/local-trial-artifacts.json').write_bytes(canonical_json(body)+b'\n')
print(f'Trial artifact manifest: {len(paths)} files')
