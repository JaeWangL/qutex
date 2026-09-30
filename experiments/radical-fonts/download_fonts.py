"""Fetch only public OFL comparison fonts pinned by SOURCES.json; verify SHA-256."""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).parent/'fonts'
for item in json.loads((root/'SOURCES.json').read_text()):
 path=root/item['file']
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
  subprocess.run(['curl','-fsSL',item['url'],'-o',str(path)],check=True)
 if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
  raise RuntimeError(f"Pinned font hash mismatch: {path.name}")
 print(path.name)
