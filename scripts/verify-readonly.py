from pathlib import Path
import hashlib,json
root=Path('/Applications/Termius.app')
before=json.loads(Path('logs/termius-inventory-before.json').read_text())
after=[]
for p in sorted(root.rglob('*')):
    if p.is_file() and not p.is_symlink():
        s=p.stat();after.append({'path':str(p.relative_to(root)),'size':s.st_size,'mtime_ns':s.st_mtime_ns})
hashes=json.loads(Path('logs/termius-bundle.json').read_text())['hashes']; checks={}
for rel,expected in hashes.items():
    h=hashlib.sha256()
    with (root/rel).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    checks[rel]=h.hexdigest()==expected
result={'inventory_size_mtime_unchanged':before==after,'sha256_unchanged':checks,'scope':'bundle regular files; no user settings or credentials read'}
Path('logs/readonly-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
assert before==after and all(checks.values())
