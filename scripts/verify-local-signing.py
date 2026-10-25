#!/usr/bin/env python3
"""Verify local signing stability with disposable binaries; never opens the Vault."""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CERT = ROOT / '.tools/local-signing/certificate.pem'

def main():
    if not CERT.exists():
        raise SystemExit('Run scripts/setup-local-signing.py first.')
    fingerprint = subprocess.check_output(['/usr/bin/openssl', 'x509', '-in', str(CERT), '-noout', '-fingerprint', '-sha1'], text=True).strip().split('=', 1)[1].replace(':', '')
    requirements = []
    with tempfile.TemporaryDirectory(prefix='terminal-signing-check-') as folder:
        folder = pathlib.Path(folder)
        source, binary = folder/'check.c', folder/'check'
        for version in (1, 2):
            source.write_text('int main(void) { return ' + str(version) + '; }\n')
            subprocess.run(['/usr/bin/clang', str(source), '-o', str(binary)], check=True, capture_output=True)
            print('Signing disposable test build', version, flush=True)
            subprocess.run(['/usr/bin/codesign', '--force', '--sign', fingerprint, '--identifier', 'dev.harbor.ssh.signing-check', '--timestamp=none', str(binary)], check=True, timeout=120)
            subprocess.run(['/usr/bin/codesign', '--verify', '--strict', str(binary)], check=True)
            result = subprocess.run(['/usr/bin/codesign', '-d', '-r-', str(binary)], check=True, capture_output=True, text=True)
            output = result.stdout + result.stderr
            requirements.append(output.split('designated =>', 1)[1].strip())
        if requirements[0] != requirements[1]:
            raise SystemExit('FAIL: code identity changed between builds')
        if fingerprint.lower() not in requirements[0].lower():
            raise SystemExit('FAIL: designated requirement does not pin the certificate')
        print('PASS: two different binaries verify with the same certificate-bound identity.')

if __name__ == '__main__':
    try: main()
    except subprocess.TimeoutExpired:
        raise SystemExit('Signing timed out. Native key authorization may be required; no app or Vault was changed.')
    except subprocess.CalledProcessError as error:
        raise SystemExit('Verification failed: ' + str(error))
