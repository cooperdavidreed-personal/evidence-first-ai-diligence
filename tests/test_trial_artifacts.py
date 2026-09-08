import hashlib
import json
from pathlib import Path
import pytest
from ic_evidence_lab.canonical import canonical_json
from scripts.scan_public import reviewed_trial_artifacts

def test_trial_artifacts_reject_changed_or_out_of_scope_files(tmp_path: Path):
    path = tmp_path / 'verification/deal-progress-20260908/proof.png'
    path.parent.mkdir(parents=True)
    data = bytes.fromhex('89504e470d0a1a0a') + b'synthetic fixture'
    path.write_bytes(data)
    body = {'files':[{'path':str(path.relative_to(tmp_path)), 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()}]}
    def save():
        manifest = {**body,'manifest_sha256':hashlib.sha256(canonical_json(body)).hexdigest()}
        (tmp_path/'verification/local-trial-artifacts.json').write_text(json.dumps(manifest))
    save()
    assert reviewed_trial_artifacts(tmp_path) == {str(path.relative_to(tmp_path))}
    path.write_bytes(data+b'changed')
    with pytest.raises(ValueError,match='changed'): reviewed_trial_artifacts(tmp_path)
    body['files'][0]['path']='private/anything.png'
    save()
    with pytest.raises(ValueError,match='outside_scope'): reviewed_trial_artifacts(tmp_path)
