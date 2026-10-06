"""
Push a local git commit to GitHub via the REST Data API.
Recursively walks trees bottom-up: subtrees uploaded first (returned with
sha), then the parent tree references them by sha. Final commit + ref update.
"""
import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "consciousclarity/marena-headless"
TOKEN = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
BRANCH = "main"


def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        method=method,
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "marena-push-script",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    def _send():
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    # Retry up to 5 times on transient errors (5xx, RemoteDisconnected).
    last_err = None
    for attempt in range(5):
        try:
            return _send()
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()}") from None
            last_err = e
            time.sleep(2 ** attempt)
        except Exception as e:  # RemoteDisconnected, URLError, etc.
            last_err = e
            time.sleep(2 ** attempt)
    raise SystemExit(f"{method} {path} -> gave up after 5 attempts: {last_err}")


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def upload_tree(local_sha, prefix=""):
    text = git("cat-file", "-p", local_sha)
    entries = []
    for line in text.splitlines():
        if not line.strip():
            continue
        meta, path = line.split("\t", 1)
        mode, type_, sha = meta.split(" ", 2)
        if type_ == "tree":
            sub_sha = upload_tree(sha, prefix + path + "/")
            entries.append({"path": path, "mode": mode, "type": "tree", "sha": sub_sha})
        else:
            content = subprocess.check_output(["git", "cat-file", "blob", sha])
            if len(content) > 5_000_000:
                print(f"  WARN: {prefix}{path} is {len(content)} bytes, skipping")
                continue
            blob = api("POST", f"/repos/{REPO}/git/blobs",
                       {"content": base64.b64encode(content).decode(), "encoding": "base64"})
            entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob["sha"]})
            print(f"  blob  {prefix}{path:50} -> {blob['sha'][:8]}")
    created = api("POST", f"/repos/{REPO}/git/trees", {"tree": entries})
    print(f"  tree  {prefix:<50} -> {created['sha'][:8]}")
    return created["sha"]


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
    sha = git("rev-parse", target)
    tree_sha = git("rev-parse", f"{target}^{{tree}}")
    msg = git("log", "-1", "--pretty=%B", target)

    # Resolve the parent to use: prefer the local ^ (works for force-pushes
    # where local history was rewritten), fall back to the remote HEAD.
    parent = None
    if subprocess.call(["git", "rev-parse", f"{target}^"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
        local_parent = git("rev-parse", f"{target}^")
        # Check if the remote knows about it
        try:
            r = api("GET", f"/repos/{REPO}/git/commits/{local_parent}")
            parent = local_parent
        except SystemExit:
            # Local commit isn't on remote — fall back to remote HEAD
            ref = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
            parent = ref["object"]["sha"]
            print(f"local parent {local_parent[:8]} not on remote, using remote HEAD {parent[:8]}")
    else:
        ref = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
        parent = ref["object"]["sha"]
    print(f"commit {sha[:8]}  tree {tree_sha[:8]}  parent {parent[:8] if parent else '(root)'}")

    print("Uploading trees bottom-up:")
    remote_tree_sha = upload_tree(tree_sha)

    payload = {"message": msg, "tree": remote_tree_sha}
    if parent:
        payload["parents"] = [parent]
    created = api("POST", f"/repos/{REPO}/git/commits", payload)
    print(f"commit {created['sha'][:8]} (remote)")

    try:
        api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": created["sha"], "force": False})
        print(f"ref {BRANCH} -> {created['sha'][:8]} (fast-forward)")
    except SystemExit as e:
        if "422" in str(e):
            print("not a fast-forward, forcing")
            api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": created["sha"], "force": True})
            print(f"ref {BRANCH} -> {created['sha'][:8]} (force)")
        else:
            raise


if __name__ == "__main__":
    main()
