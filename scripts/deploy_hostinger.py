"""
Deploy the Marena headless build (Strapi CMS + Next.js frontend) to
alp-see.at via the Hostinger REST API.

Flow per app:
  1. Generate TUS upload URL via /api/hosting/v1/files/upload-urls
  2. Upload the zip via TUS protocol to public_html/<name>.zip
  3. Set environment variables (PUT /api/hosting/v1/.../nodejs/builds/settings/env)
  4. Start build (POST /api/hosting/v1/.../nodejs/builds with source_type: archive)
  5. Poll build status, dump logs on failure
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN = os.environ["HOSTINGER_API_TOKEN"]
USERNAME = "u506698511"  # alp-see.com / alp-see.at account
DOMAIN = "alp-see.at"
BASE = "https://developers.hostinger.com/api/hosting/v1"


def api(method, path, body=None, expect=200):
    url = f"{BASE}{path}"
    req = urllib.request.Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "marena-deploy/1.0 (+hostinger-rest)",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            return r.status, (json.loads(data) if data else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise SystemExit(f"{method} {path} -> {e.code} {body}") from None


def generate_upload_url(relative_path: str) -> dict:
    _, data = api("POST", "/files/upload-urls", {"username": USERNAME, "domain": DOMAIN})
    return data


def tus_upload(upload_url: str, file_path: str, auth_key: str, rest_auth_key: str) -> None:
    size = os.path.getsize(file_path)
    name = os.path.basename(file_path)
    full = f"{upload_url}/{name}?override=true"
    headers = {
        "X-Auth": auth_key,
        "X-Auth-Rest": rest_auth_key,
        "Tus-Resumable": "1.0.0",
    }
    # 1. Create upload
    req = urllib.request.Request(full, method="POST", headers={
        **headers, "Upload-Length": str(size), "Upload-Offset": "0",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status != 201:
            raise SystemExit(f"TUS create {r.status}")
    # 2. PATCH with full body
    with open(file_path, "rb") as f:
        body = f.read()
    req = urllib.request.Request(full, method="PATCH", headers={
        **headers, "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
    }, data=body)
    with urllib.request.urlopen(req, timeout=300) as r:
        if r.status != 204:
            raise SystemExit(f"TUS patch {r.status}")
        final = r.headers.get("Upload-Offset", "?")
    print(f"  uploaded {size} bytes, final offset {final}")


def set_env_vars(env_vars: list[dict]) -> None:
    path = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds/settings/env"
    api("PUT", path, {"env_vars": env_vars})


def start_build(archive_path: str, app_type: str = None, build_script: str = "build", entry_file: str = None, root_dir: str = ".", node_version: int = 22) -> dict:
    path = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds"
    body = {
        "node_version": node_version,
        "root_directory": root_dir,
        "build_script": build_script,
        "package_manager": "npm",
        "source_type": "archive",
        "source_options": {"archive_path": archive_path},
    }
    if app_type:
        body["app_type"] = app_type
    if entry_file:
        body["entry_file"] = entry_file
    _, data = api("POST", path, body)
    return data


def list_builds() -> list[dict]:
    path = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds"
    _, data = api("GET", path)
    return data if isinstance(data, list) else data.get("data", [])


def get_build(uuid: str) -> dict:
    path = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds/{uuid}"
    _, data = api("GET", path)
    return data


def get_build_logs(uuid: str) -> str:
    path = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs/builds/{uuid}/logs"
    _, data = api("GET", path)
    return data.get("logs", "") if isinstance(data, dict) else str(data)


def cms_env_for():
    return [
        {"key": "HOST", "value": "0.0.0.0"},
        {"key": "PORT", "value": "1337"},
        {"key": "APP_KEYS", "value": "k1,k2,k3,k4"},
        {"key": "API_TOKEN_SALT", "value": "salt-api-marena-2026"},
        {"key": "ADMIN_JWT_SECRET", "value": "jwt-marena-2026"},
        {"key": "TRANSFER_TOKEN_SALT", "value": "transfer-marena-2026"},
        {"key": "ENCRYPTION_KEY", "value": "enc-marena-2026"},
        {"key": "PUBLIC_URL", "value": "https://alp-see.at"},
        {"key": "DATABASE_CLIENT", "value": "mysql"},
        {"key": "DATABASE_HOST", "value": "127.0.0.1"},
        {"key": "DATABASE_PORT", "value": "3306"},
        {"key": "DATABASE_NAME", "value": os.environ["MARENABALI_STRAPI_DB_NAME"]},
        {"key": "DATABASE_USERNAME", "value": os.environ["MARENABALI_STRAPI_DB_USER"]},
        {"key": "DATABASE_PASSWORD", "value": os.environ["MARENABALI_STRAPI_DB_PASSWORD"]},
        {"key": "DATABASE_SSL", "value": "false"},
        {"key": "REVALIDATE_SECRET", "value": os.environ.get("REVALIDATE_SECRET", "mr-9d2e-f8a1-marena-bali-2026")},
        {"key": "FRONTEND_REVALIDATE_URL", "value": "https://alp-see.at/api/revalidate"},
        {"key": "NODE_ENV", "value": "production"},
    ]


def fe_env_for():
    return [
        {"key": "STRAPI_URL", "value": "https://alp-see.at"},
        {"key": "STRAPI_API_TOKEN", "value": "REPLACE_AFTER_CMS_FIRST_LOGIN"},
        {"key": "REVALIDATE_SECRET", "value": os.environ.get("REVALIDATE_SECRET", "mr-9d2e-f8a1-marena-bali-2026")},
        {"key": "NODE_ENV", "value": "production"},
    ]


def deploy_app(name: str, zip_path: str, app_type: str, build_script: str, env_vars: list[dict], entry_file: str = None, archive_subdir: str = ".") -> str:
    print(f"\n=== Deploying {name} ===")
    print(f"  archive: {zip_path}")
    print(f"  type: {app_type} | build: {build_script} | entry: {entry_file or '(auto)'}")

    print("[1/5] generate upload URL")
    rel = f"marena-deploy/{name}.zip"
    upload = generate_upload_url(rel)
    print(f"  url: {upload['url'][:80]}…")

    print(f"[2/5] TUS upload {os.path.getsize(zip_path)} bytes")
    tus_upload(upload["url"], zip_path, upload["auth_key"], upload["rest_auth_key"])
    archive_path = f"public_html/{rel}"

    print(f"[3/5] set {len(env_vars)} env vars")
    set_env_vars(env_vars)

    print(f"[4/5] start build (app_type={app_type})")
    build = start_build(archive_path, app_type, build_script, entry_file, archive_subdir)
    uuid = build.get("uuid")
    print(f"  uuid: {uuid}")

    print(f"[5/5] polling…")
    for i in range(60):  # up to 10 min
        time.sleep(10)
        b = get_build(uuid)
        state = b.get("state", "?")
        print(f"  [{i*10:3d}s] state={state}")
        if state in ("success", "failed", "error", "cancelled"):
            if state != "success":
                print("\n--- BUILD FAILED — LOGS ---")
                print(get_build_logs(uuid))
                raise SystemExit(1)
            return uuid
    raise SystemExit("build timed out after 10 min")


def main():
    if len(sys.argv) < 2:
        print("usage: deploy_hostinger.py [cms|frontend|both]")
        sys.exit(1)
    target = sys.argv[1]

    deploy_root = os.path.join(os.path.dirname(__file__), "..", "deploy")
    cms_zip = os.path.abspath(os.path.join(deploy_root, "cms.zip"))
    fe_zip = os.path.abspath(os.path.join(deploy_root, "frontend.zip"))

    if target in ("cms", "both"):
        deploy_app("cms", cms_zip, None, "build", cms_env_for(), entry_file="server.js", archive_subdir=".")

    if target in ("frontend", "both"):
        deploy_app("frontend", fe_zip, None, "build", fe_env_for(), entry_file=None, archive_subdir=".")

    print("\nAll done. Verify:")
    print(f"  https://alp-see.at/")
    print(f"  https://alp-see.at/admin")


if __name__ == "__main__":
    main()
