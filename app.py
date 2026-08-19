import logging
from functools import wraps
from pathlib import Path

from flask import Flask, request, send_from_directory

from auth.auth import AUTHORIZED_USERS

app = Flask(__name__)

SHARE = Path("/mnt/data-analytics/Jesse/web")


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)

audit_handler = logging.FileHandler(
    "/mnt/data-analytics/Jesse/web/logs/audit.log"
)
audit_handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s"))
audit_logger.addHandler(audit_handler)


@app.after_request
def audit_request(response):
    """Logs all inbound requests, regardless of route or outcome."""
    username = get_authenticated_user() or "UNKNOWN"

    audit_logger.info(
        "user=%s | ip=%s | method=%s | path=%s | status=%s",
        username,
        request.remote_addr,
        request.method,
        request.path,
        response.status_code,
    )

    return response


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def get_authenticated_user():
    """Pulls the AD username passed by the upstream proxy, if any."""
    user = request.headers.get("X-Remote-User")

    if not user:
        return None

    if "\\" in user:
        user = user.split("\\", 1)[1]

    return user.lower()


def get_user_permissions():
    """Returns (username, permissions) for the current request, or (username, None)
    if the user isn't in AUTHORIZED_USERS, or (None, None) if unauthenticated."""
    username = get_authenticated_user()

    if username is None:
        return None, None

    permissions = AUTHORIZED_USERS.get(username)

    return username, permissions


def user_has_report_access(report_name):
    """Standalone check, kept for use outside route handlers if needed."""
    _, permissions = get_user_permissions()

    if permissions is None:
        return False

    return report_name in permissions.get("reports", [])


def require_report_access(report_name):
    """Route decorator: 403s and audit-logs any request lacking access to
    `report_name`. Applies the same check used for page routes to their
    static/data routes as well, so files can't be pulled by hitting the
    file URL directly."""
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):
            username, permissions = get_user_permissions()

            if permissions is None or report_name not in permissions.get("reports", []):
                audit_logger.warning(
                    "ACCESS_DENIED | user=%s | report=%s",
                    username,
                    report_name,
                )
                return "Access denied", 403

            return view_func(*args, **kwargs)
        return wrapped
    return decorator


# ---------------------------------------------------------------------------
# Home
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    username, permissions = get_user_permissions()

    if permissions is None:
        return "Access denied", 403

    return f"""
    <h1>HealthFirst Family Care Center</h1>
    <h2>Data Analytics Reporting Server</h2>
    <h2>Welcome {username}</h2>

    <p>Server Status: A - OK</p>

    <ul>
        <li><a href="/status">Status</a></li>
        <li><a href="/ppd">PPD Dashboard</a></li>
        <li><a href="/pophealth">Pophealth Dashboard</a></li>
    </ul>
    """


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@app.route("/status")
@require_report_access("status")
def status():
    status_file = SHARE / "status" / "index.html"

    if not status_file.exists():
        return "<h1>Status page unavailable.</h1>", 404

    return status_file.read_text(encoding="utf-8")


@app.route("/status/<path:filename>")
@require_report_access("status")
def status_static(filename):
    return send_from_directory(SHARE / "status", filename)


# ---------------------------------------------------------------------------
# PPD
# ---------------------------------------------------------------------------

@app.route("/ppd")
@require_report_access("ppd")
def ppd():
    ppd_file = SHARE / "reports" / "ppd" / "static" / "ppd.html"

    if not ppd_file.exists():
        return "<h1>PPD dashboard unavailable.</h1>", 404

    return ppd_file.read_text(encoding="utf-8")


@app.route("/ppd/<path:filename>")
@require_report_access("ppd")
def ppd_static(filename):
    if filename in ("", "ppd.html"):
        return ppd()

    return send_from_directory(
        str(SHARE / "reports" / "ppd" / "static"), filename
    )


@app.route("/ppd/data/<path:filename>")
@require_report_access("ppd")
def ppd_data(filename):
    data_dir = SHARE / "reports" / "ppd" / "data"
    return send_from_directory(str(data_dir), filename)




# @app.route("/ppd/<path:filename>")
# @require_report_access("ppd")
# def ppd_static(filename):
#     return send_from_directory(SHARE / "reports" / "ppd", filename)


# ---------------------------------------------------------------------------
# Pophealth
# ---------------------------------------------------------------------------

@app.route("/pophealth")
@app.route("/pophealth/")
@require_report_access("pophealth")
def pophealth():
    username, _ = get_user_permissions()

    pophealth_file = SHARE / "reports" / "pophealth" / "static" / "index.html"
    if not pophealth_file.exists():
        return "<h1>Pop Health dashboard unavailable.</h1>", 404

    html = pophealth_file.read_text(encoding="utf-8")
    html = html.replace("<head>", '<head>\n<base href="/pophealth/">', 1)
    html = html.replace("John Doe", username)

    return html


@app.route("/pophealth/<path:filename>")
@require_report_access("pophealth")
def pophealth_static(filename):
    if filename in ("", "index.html"):
        return pophealth()

    return send_from_directory(
        str(SHARE / "reports" / "pophealth" / "static"), filename
    )


@app.route("/pophealth/data/<path:filename>")
@require_report_access("pophealth")
def pophealth_data(filename):
    data_dir = SHARE / "reports" / "pophealth" / "data"
    return send_from_directory(str(data_dir), filename)


@app.route("/pophealth/debug-user")
@require_report_access("pophealth")
def pophealth_debug_user():
    lines = ["<h1>Pophealth Debug User</h1>", "<h2>Possible Auth Values</h2>", "<pre>"]

    lines.append(f"X-Remote-User = {request.headers.get('X-Remote-User')}")
    lines.append(f"X-Remote-Name = {request.headers.get('X-Remote-Name')}")

    lines.append("</pre>")
    lines.append("<h2>All Headers</h2>")
    lines.append("<pre>")

    for key, value in request.headers.items():
        lines.append(f"{key}: {value}")

    lines.append("</pre>")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------

@app.route("/budget")
@app.route("/budget/")
@require_report_access("budget")
def budget():
    username, _ = get_user_permissions()

    budget_file = SHARE / "reports" / "budget" / "static" / "budget.html"
    if not budget_file.exists():
        return "<h1>Budget dashboard unavailable.</h1>", 404

    html = budget_file.read_text(encoding="utf-8")
    html = html.replace("<head>", '<head>\n<base href="/budget/">', 1)
    html = html.replace("John Doe", username)

    return html


@app.route("/budget/<path:filename>")
@require_report_access("budget")
def budget_static(filename):
    if filename in ("", "index.html"):
        return budget()

    return send_from_directory(
        str(SHARE / "reports" / "budget" / "static"), filename
    )


@app.route("/budget/data/<path:filename>")
@require_report_access("budget")
def budget_data(filename):
    data_dir = SHARE / "reports" / "budget" / "data"
    return send_from_directory(str(data_dir), filename)



# ---------------------------------------------------------------------------
# Care Gaps
# ---------------------------------------------------------------------------
# Add this block to app.py, in the same position/style as the other reports
# (status / ppd / pophealth / budget). Requires "caregaps" to be added to
# each authorized user's "reports" list in auth/auth.py's AUTHORIZED_USERS.
#
# File layout expected under SHARE / "reports" / "caregaps":
#   static/caregaps.html   <- overview page (this is the entry point)
#   static/caregaps.css
#   static/script.js
#   static/obesity.html    <- per-domain detail pages, added as built
#   static/obesity.css
#   static/obesity.js
#   snapshots/obesity_2026_08.json   <- dated snapshots written by Obesity.py
#                                        (sibling of static/, NOT under data/)
#
# The frontend (script.js/obesity.js) fetches its data via the "latest"
# route below, which resolves the current dated filename server-side so
# the frontend never needs to know today's exact filename.

@app.route("/caregaps")
@app.route("/caregaps/")
@require_report_access("caregaps")
def caregaps():
    username, _ = get_user_permissions()

    caregaps_file = SHARE / "reports" / "caregaps" / "static" / "caregaps.html"
    if not caregaps_file.exists():
        return "<h1>Care Gaps dashboard unavailable.</h1>", 404

    html = caregaps_file.read_text(encoding="utf-8")
    html = html.replace("<head>", '<head>\n<base href="/caregaps/">', 1)
    html = html.replace("__USERNAME__", username)

    return html


@app.route("/caregaps/<path:filename>")
@require_report_access("caregaps")
def caregaps_static(filename):
    if filename in ("", "caregaps.html"):
        return caregaps()

    return send_from_directory(
        str(SHARE / "reports" / "caregaps" / "static"), filename
    )


@app.route("/caregaps/data/<domain>/latest")
@require_report_access("caregaps")
def caregaps_data_latest(domain):
    """
    Serves the most recent dated snapshot for a given domain (e.g.
    domain="obesity" -> newest file matching snapshots/obesity_*.json)
    without the frontend needing to know today's exact filename.

    Snapshot filenames are expected in the {domain}_{YYYY}_{MM}.json format
    written by each domain module's build() function (see Obesity.py). Since
    that format sorts correctly as a plain string (YYYY before MM, zero
    padded), the lexicographically-largest matching filename is also the
    most recent one -- no need to parse dates out of the filename.
    """
    snapshots_dir = SHARE / "reports" / "caregaps" / "snapshots"

    matches = sorted(snapshots_dir.glob(f"{domain}_*.json"))
    if not matches:
        return f"No snapshot found for domain '{domain}'", 404

    latest = matches[-1]
    return send_from_directory(str(snapshots_dir), latest.name)



if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)


