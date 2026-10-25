#!/usr/bin/env python3
"""Create a project-local code signing identity, without adding certificate trust.
Only the public certificate is kept on disk. Private key resides in login Keychain.
"""
import os
import pathlib
import secrets
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CERT = ROOT / '.tools/local-signing/certificate.pem'

def run(args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)

def fingerprint(cert):
    return run(['/usr/bin/openssl','x509','-in',str(cert),'-noout','-fingerprint','-sha1']).stdout.decode().strip().split('=',1)[1].replace(':','')

def main():
    CERT.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if CERT.exists():
        print('Existing local identity:', fingerprint(CERT))
        return
    os.umask(0o077)
    keychain=run(['/usr/bin/security','default-keychain','-d','user']).stdout.decode().strip().strip('"')
    with tempfile.TemporaryDirectory(prefix='terminal-signing-') as tmp:
        folder=pathlib.Path(tmp)
        config=folder/'openssl.cnf'
        config.write_text('''[req]
prompt = no
distinguished_name = dn
x509_extensions = codesign
[dn]
CN = Terminal Local Development
[codesign]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
''')
        key=folder/'key.pem'; cert=folder/'certificate.pem'; p12=folder/'identity.p12'
        run(['/usr/bin/openssl','req','-new','-newkey','rsa:3072','-nodes','-x509','-sha256','-days','3650','-config',str(config),'-keyout',str(key),'-out',str(cert)])
        password=secrets.token_urlsafe(48)
        environment=dict(os.environ, TERMINAL_P12_PASSWORD=password)
        run(['/usr/bin/openssl','pkcs12','-export','-inkey',str(key),'-in',str(cert),'-out',str(p12),'-passout','env:TERMINAL_P12_PASSWORD'],env=environment)
        # Only codesign is preauthorized for this newly created private key. No -A,
        # trust-store changes, Gatekeeper settings, or existing item ACL changes.
        run(['/usr/bin/security','import',str(p12),'-k',keychain,'-P',password,'-T','/usr/bin/codesign'],timeout=45)
        CERT.write_bytes(cert.read_bytes())
        print('Created local identity:', fingerprint(CERT))
        print('Private key: login Keychain. System certificate trust: unchanged.')

if __name__ == '__main__':
    try: main()
    except subprocess.TimeoutExpired:
        raise SystemExit('Keychain import did not complete; no system trust changes were made.')
    except subprocess.CalledProcessError as error:
        # Do not print command argv: import includes a temporary PKCS12 password.
        raise SystemExit('Local signing setup failed: '+error.stderr.decode(errors='replace'))
