"""Command-line account tools for OptiInspect. Useful when nobody can sign in.

  python manage_users.py list
  python manage_users.py create you@example.com "Your Name" --role admin
  python manage_users.py reset you@example.com
  python manage_users.py role you@example.com viewer

Run it on the machine that hosts the app. It prints a temporary password once; the person must change it
the next time they sign in.
"""
import argparse
import sys

import auth


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    c = sub.add_parser("create")
    c.add_argument("email")
    c.add_argument("name")
    c.add_argument("--role", choices=auth.ROLES, default="reviewer")
    r = sub.add_parser("reset")
    r.add_argument("email")
    ro = sub.add_parser("role")
    ro.add_argument("email")
    ro.add_argument("role", choices=auth.ROLES)
    a = p.parse_args()

    users = dict(auth.load_users())
    if a.cmd == "list":
        for u in sorted(users.values(), key=lambda u: u["created"]):
            print(f"{u['email']:36s} {u['role']:9s} {'active' if u.get('active', True) else 'disabled':9s} {u['name']}")
        return
    email = auth.clean_email(a.email)
    if a.cmd == "create":
        if not auth.EMAIL_RE.match(email):
            sys.exit("That does not look like an email address.")
        if auth.find_by_email(email):
            sys.exit("An account with that email already exists.")
        password = auth.temp_password()
        user = auth.new_user(auth.clean_name(a.name), email, password, a.role, must_change=True)
        users[user["id"]] = user
        auth.save_users(users)
        print(f"Created {email} as {a.role}. Temporary password (shown once): {password}")
        return
    target = auth.find_by_email(email)
    if target is None:
        sys.exit("No account with that email.")
    if a.cmd == "reset":
        password = auth.temp_password()
        users[target["id"]] = {**target, "pw": auth.generate_password_hash(password), "sv": target.get("sv", 0) + 1,
                               "must_change": True, "active": True}
        auth.save_users(users)
        print(f"Password reset for {email}. Temporary password (shown once): {password}")
    elif a.cmd == "role":
        users[target["id"]] = {**target, "role": a.role, "sv": target.get("sv", 0) + 1}
        auth.save_users(users)
        print(f"{email} is now a {a.role}.")


if __name__ == "__main__":
    main()
