"""Rotate the private chat password without putting it in Git or argv."""
import argparse
import getpass
import os
import secrets
import sys
from pathlib import Path
from werkzeug.security import generate_password_hash


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('env_file', type=Path)
    parser.add_argument('--stdin', action='store_true', help='Read the password from stdin for automation')
    args = parser.parse_args()
    password = sys.stdin.readline().rstrip('\r\n') if args.stdin else getpass.getpass('Nova senha do chat: ')
    if not password:
        raise SystemExit('Senha vazia não permitida.')
    path = args.env_file
    lines = path.read_text().splitlines() if path.exists() else []
    keys = {'HERMES_WEB_CHAT_PASSWORD_HASH', 'HERMES_WEB_CHAT_SESSION_SECRET'}
    lines = [line for line in lines if line.partition('=')[0] not in keys]
    lines += ['HERMES_WEB_CHAT_PASSWORD_HASH=' + generate_password_hash(password),
              'HERMES_WEB_CHAT_SESSION_SECRET=' + secrets.token_hex(32)]
    temporary = path.with_name(path.name + '.new')
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write('\n'.join(lines) + '\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    print('Senha atualizada. Reinicie o serviço para aplicar e encerrar sessões antigas.')


if __name__ == '__main__':
    main()
