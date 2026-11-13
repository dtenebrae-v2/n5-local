"""Restore the permanent Android signing key from CI secrets without logging it."""
import base64
import os
from pathlib import Path


def prepare(environment):
    names = ['N5_KEYSTORE_BASE64', 'N5_STORE_PASSWORD', 'N5_KEY_ALIAS', 'N5_KEY_PASSWORD']
    missing = [name for name in names if not environment.get(name)]
    if missing:
        raise ValueError('Configure GitHub Actions secrets: ' + ', '.join(missing))
    destination = Path(environment['RUNNER_TEMP']) / 'n5-release.keystore'
    content = base64.b64decode(environment['N5_KEYSTORE_BASE64'], validate=True)
    if not content:
        raise ValueError('Empty Android signing key')
    destination.write_bytes(content)
    destination.chmod(0o600)
    with open(environment['GITHUB_ENV'], 'a', encoding='utf-8') as stream:
        stream.write(f'N5_KEYSTORE={destination}\n')
        # Match the existing local release script so CI can update installed APKs.
        import time
        stream.write(f'N5_VERSION_CODE={int(time.time())}\n')
        stream.write(f'N5_VERSION_NAME={environment["GITHUB_REF_NAME"]}\n')
    return destination


if __name__ == '__main__':
    prepare(os.environ)
