#!/usr/bin/env python3
"""Copies Free My TV's settings between an LG TV and this computer, so a reinstall keeps them.

    python3 webos/backup.py 192.168.1.50            # TV -> ~/.freemytv/backups/freemytv-<date>.json
    python3 webos/backup.py 192.168.1.50 --restore  # newest copy -> TV; the app loads it when it starts empty

The app writes /media/developer/temp/freemytv-backup.json on every change. Uses install.py's SSH key, so run
install.py once first. The copy can hold the TMDB key typed on the TV: it stays in your user folder, not in git.
"""
import glob
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import install  # noqa: E402

REMOTE = '/media/developer/temp/freemytv-backup.json'
FOLDER = os.path.join(os.path.expanduser('~'), '.freemytv', 'backups')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or not re.match(r'^\d{1,3}(\.\d{1,3}){3}$', args[0]):
        sys.exit(__doc__)
    ip, key = args[0], install.key_path(args[0])
    if not os.path.exists(key):
        sys.exit('No key for this TV yet: run python3 webos/install.py %s first.' % ip)
    if '--restore' in sys.argv:
        copies = sorted(glob.glob(os.path.join(FOLDER, 'freemytv-*.json')))
        if not copies:
            sys.exit('No copy in %s.' % FOLDER)
        with open(copies[-1], 'rb') as f:
            data = f.read()
        out = install.ssh(ip, key, 'mkdir -p /media/developer/temp && cat > ' + REMOTE, data=data)
        print('Restored %s. Close Free My TV (or reinstall it) and open it again.' % os.path.basename(copies[-1])
              if out.returncode == 0 else 'Could not copy it to the TV.')
        return
    out = install.ssh(ip, key, 'cat ' + REMOTE)
    if out.returncode != 0 or not out.stdout.strip():
        sys.exit('No backup on the TV yet: change any setting in Free My TV first.')
    os.makedirs(FOLDER, exist_ok=True)
    path = os.path.join(FOLDER, 'freemytv-%s.json' % time.strftime('%Y%m%d-%H%M%S'))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(out.stdout)
    install.lock(path)
    print('Saved %s' % path)


if __name__ == '__main__':
    main()
