"""Manually build the full offline APK and deploy the local Docker container."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.automation'


def run(command, *, env=None, cwd=ROOT, capture=False):
    print('+ ' + ' '.join(map(str, command)), flush=True)
    result = subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True,
                            stdin=subprocess.DEVNULL, text=capture,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def fingerprint():
    """Record local source and media metadata for the release report."""
    digest = hashlib.sha256()
    tracked = run(['git', 'ls-files', '-z'], capture=True).split('\0')
    paths = {ROOT / name for name in tracked if name}
    paths.update(p for p in (ROOT / 'data/materials').rglob('*') if p.is_file())
    for path in sorted(paths):
        if path.is_file():
            stat = path.stat()
            digest.update(f'{path.relative_to(ROOT)}:{stat.st_size}:{stat.st_mtime_ns}\n'.encode())
    return digest.hexdigest()


def build_environment():
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    tools = ROOT / '.build-tools'
    for key, path in {
        'JAVA_HOME': tools / 'jdk', 'ANDROID_HOME': tools / 'sdk',
        'GRADLE_USER_HOME': tools / 'gradle-cache',
        'N5_GRADLE': tools / 'gradle-8.11.1/bin/gradle',
    }.items():
        if path.exists():
            env.setdefault(key, str(path))
    return env


def verify_apk(apk, assets):
    expected = json.loads((assets / 'content.json').read_text())
    with ZipFile(apk) as archive:
        assert json.loads(archive.read('assets/content.json')) == expected, 'Wrong APK payload manifest'
        with archive.open('assets/content.zip') as payload:
            assert hashlib.file_digest(payload, 'sha256').hexdigest() == expected['sha256'], 'Wrong APK payload'
    return expected


def publish(apk, label, details):
    output = ROOT / 'dist/releases' / label
    output.mkdir(parents=True)
    destination = output / 'n5-local-arm64.apk'
    # Gradle may modify an existing APK in place on the next build: keep an independent copy.
    shutil.copy2(apk, destination)
    with destination.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    destination.with_suffix('.apk.sha256').write_text(f'{digest}  {destination.name}\n')
    (output / 'release.json').write_text(json.dumps(details | {'apkSha256': digest}, indent=2) + '\n')
    print(f'APK: {destination}', flush=True)
    return output


def finish_release(output, compose, env, previous):
    temporary = ROOT / 'dist/.latest.tmp'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(Path('releases') / output.name, target_is_directory=True)
    temporary.replace(ROOT / 'dist/latest')
    # Only remove this script's old successful releases, never unrelated dist files.
    releases = sorted(p for p in output.parent.iterdir() if p.is_dir() and not p.is_symlink()
                      and re.fullmatch(r'\d{8}-\d{6}', p.name) and (p / 'success.json').is_file())
    for old in releases[:-2]:
        shutil.rmtree(old)
    container = run(compose + ['ps', '-q', 'n5'], env=env, capture=True)
    current = run(['docker', 'inspect', '--format', '{{.Image}}', container], env=env, capture=True)
    tags = run(['docker', 'image', 'ls', 'n5-local', '--format', '{{.Repository}}:{{.Tag}}'], env=env, capture=True)
    for tag in tags.splitlines():
        if not re.fullmatch(r'n5-local:(release|rollback)-\d{8}-\d{6}', tag):
            continue
        image = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], env=env, capture=True)
        if image not in {current, previous}:
            # No force: Docker also protects images still used by a container.
            subprocess.run(['docker', 'image', 'rm', tag], env=env, check=False)


def pipeline(env, source):
    label = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    commit = run(['git', 'rev-parse', '--short=12', 'HEAD'], capture=True)
    env = dict(env, N5_IMAGE_TAG=f'release-{label}', N5_VERSION_CODE=str(int(time.time())),
               N5_VERSION_NAME=f'1.0-{label}-{commit}')
    if not env.get('BROWSER_PATH'):
        for candidate in ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']:
            if browser := shutil.which(candidate):
                env['BROWSER_PATH'] = browser
                break
    run([sys.executable, '-m', 'n5.vocabulary', 'validate'], env=env)
    run([sys.executable, '-m', 'unittest', 'discover', '-q'], env=env)
    run(['npm', 'run', 'test:forms'], env=env)
    run(['npm', 'run', 'test:ui'], env=env)
    # Build everything before replacing the running container.
    gradle = env.get('N5_GRADLE', str(ROOT / 'android/gradlew'))
    run([gradle, '--no-daemon', '--console=plain', 'assembleDebug', 'lintDebug'], cwd=ROOT / 'android', env=env)
    assets = ROOT / 'android/app/build/generated/n5-assets'
    run([sys.executable, ROOT / 'scripts/check_android_bundle.py', assets], env=env)
    apk = ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk'
    materials = verify_apk(apk, assets)
    sdk = Path(env.get('ANDROID_HOME') or env.get('ANDROID_SDK_ROOT') or '')
    build_tools = sdk / 'build-tools/35.0.0'
    run([build_tools / 'apksigner', 'verify', apk], env=env)
    run([build_tools / 'zipalign', '-c', '-P', '16', '4', apk], env=env)
    compose = ['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.yaml')]
    previous_container = run(compose + ['ps', '-q', 'n5'], env=env, capture=True)
    previous = run(['docker', 'inspect', '--format', '{{.Image}}', previous_container], capture=True) if previous_container else None
    run(compose + ['build', 'n5'], env=env)
    output = publish(apk, label, {'commit': commit, 'source': source, 'materials': materials,
                                'versionCode': int(env['N5_VERSION_CODE']), 'image': f"n5-local:{env['N5_IMAGE_TAG']}"})
    try:
        run(compose + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '60', 'n5'], env=env)
    except subprocess.CalledProcessError:
        try:
            if previous:
                rollback = f'rollback-{label}'
                run(['docker', 'tag', previous, f'n5-local:{rollback}'], env=env)
                print('Восстанавливаем предыдущий Docker-образ.', flush=True)
                run(compose + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '60', 'n5'],
                    env=dict(env, N5_IMAGE_TAG=rollback))
        finally:
            shutil.rmtree(output)
        raise
    report = {'source': source, 'commit': commit, 'release': str(output), 'completedAt': label}
    (output / 'success.json').write_text(json.dumps(report, indent=2) + '\n')
    finish_release(output, compose, env, previous)
    with tempfile.NamedTemporaryFile(mode='w', dir=STATE, delete=False) as stream:
        json.dump(report, stream)
        temporary = Path(stream.name)
    temporary.replace(STATE / 'last-success.json')
    print('SUCCESS: Docker healthy; APK ready.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    STATE.mkdir(exist_ok=True)
    with (STATE / 'release.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('SKIP: другая сборка ещё работает.')
            return
        env = build_environment()
        source = fingerprint()
        pipeline(env, source)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, AssertionError, subprocess.CalledProcessError) as error:
        print(f'RELEASE FAILED: {error}', file=sys.stderr)
        sys.exit(1)
