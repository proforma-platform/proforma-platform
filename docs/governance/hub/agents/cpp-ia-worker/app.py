import json
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple


HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8080"))
WORKER_ID = os.getenv("WORKER_ID", "CPP-IA")
WORKER_ROLE = os.getenv("WORKER_ROLE", "analysis")
WORKER_SERVICE = os.getenv("WORKER_SERVICE", "govhub-cpp-ia-worker")
GITOPS_ENABLED = os.getenv("GITOPS_ENABLED", "false").lower() == "true"
GITOPS_ALLOWED_BASE = Path(os.getenv("GITOPS_ALLOWED_BASE", "/workspace")).resolve()
GITOPS_DEFAULT_REMOTE = os.getenv("GITOPS_DEFAULT_REMOTE", "origin")
GITOPS_DEFAULT_BASE_BRANCH = os.getenv("GITOPS_DEFAULT_BASE_BRANCH", "main")
GITOPS_TIMEOUT_SECONDS = int(os.getenv("GITOPS_TIMEOUT_SECONDS", "20"))


SAFE_REF_RE = re.compile(r"^[A-Za-z0-9._/-]{1,120}$")
SAFE_MESSAGE_RE = re.compile(r"^[^\r\n]{1,240}$")


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._reply(
                200,
                {
                    "status": "ok",
                    "worker_id": WORKER_ID,
                    "role": WORKER_ROLE,
                    "service": WORKER_SERVICE,
                    "gitops_enabled": GITOPS_ENABLED,
                    "gitops_allowed_base": str(GITOPS_ALLOWED_BASE),
                },
            )
            return
        self._reply(404, {"status": "error", "error_code": "NOT_FOUND"})

    def do_POST(self) -> None:
        if self.path != "/run":
            self._reply(404, {"status": "error", "error_code": "NOT_FOUND"})
            return

        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            data = json.loads(raw.decode("utf-8") if raw else "{}")
        except Exception:
            self._reply(400, {"status": "error", "error_code": "INVALID_JSON"})
            return

        mission_id = str(data.get("mission_id", "")).strip()
        task_id = str(data.get("task_id", "")).strip()
        udn_block = str(data.get("udn_block", "")).strip()
        git_ops = data.get("git_ops") if isinstance(data.get("git_ops"), dict) else None

        if not mission_id:
            self._reply(400, {"status": "error", "error_code": "MISSION_ID_REQUIRED"})
            return

        response: Dict[str, Any] = {
            "status": "ok",
            "worker_id": WORKER_ID,
            "mission_id": mission_id,
            "task_id": task_id,
            "result": "accepted",
            "udn_received": bool(udn_block),
            "next_action": "report_ingest",
        }

        if git_ops is not None:
            if not GITOPS_ENABLED:
                self._reply(
                    400,
                    {
                        "status": "error",
                        "worker_id": WORKER_ID,
                        "mission_id": mission_id,
                        "task_id": task_id,
                        "error_code": "GITOPS_DISABLED",
                        "message": "git_ops requested but disabled",
                    },
                )
                return

            ok, payload = run_git_ops(git_ops)
            if not ok:
                self._reply(
                    422,
                    {
                        "status": "error",
                        "worker_id": WORKER_ID,
                        "mission_id": mission_id,
                        "task_id": task_id,
                        "error_code": payload.get("error_code", "GITOPS_FAILED"),
                        "message": payload.get("message", "git operation failed"),
                        "git_ops": payload,
                        "next_action": "report_ingest",
                    },
                )
                return

            response["git_ops"] = payload

        self._reply(200, response)

    def log_message(self, fmt: str, *args: Any) -> None:
        return


def run_git_ops(spec: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
    repo_path = str(spec.get("repo_path", "")).strip()
    branch = str(spec.get("branch", "")).strip()
    commit_message = str(spec.get("commit_message", "")).strip()
    remote = str(spec.get("remote", GITOPS_DEFAULT_REMOTE)).strip() or GITOPS_DEFAULT_REMOTE
    base_branch = str(spec.get("base_branch", GITOPS_DEFAULT_BASE_BRANCH)).strip() or GITOPS_DEFAULT_BASE_BRANCH
    push_enabled = bool(spec.get("push", True))
    stage_all = bool(spec.get("stage_all", True))
    fetch_remote = bool(spec.get("fetch_remote", True))

    if not repo_path:
        return False, {"error_code": "GITOPS_REPO_PATH_REQUIRED", "message": "repo_path is required"}
    if not branch or not SAFE_REF_RE.match(branch):
        return False, {"error_code": "GITOPS_BRANCH_INVALID", "message": "invalid branch"}
    if not base_branch or not SAFE_REF_RE.match(base_branch):
        return False, {"error_code": "GITOPS_BASE_BRANCH_INVALID", "message": "invalid base_branch"}
    if not remote or not SAFE_REF_RE.match(remote):
        return False, {"error_code": "GITOPS_REMOTE_INVALID", "message": "invalid remote"}
    if not commit_message or not SAFE_MESSAGE_RE.match(commit_message):
        return False, {"error_code": "GITOPS_COMMIT_MESSAGE_INVALID", "message": "invalid commit_message"}

    try:
        repo = Path(repo_path).resolve()
    except Exception:
        return False, {"error_code": "GITOPS_REPO_PATH_INVALID", "message": "repo_path invalid"}

    if not is_within_allowed_base(repo):
        return False, {
            "error_code": "GITOPS_REPO_PATH_FORBIDDEN",
            "message": "repo_path outside allowed base",
        }

    if not (repo / ".git").exists():
        return False, {"error_code": "GITOPS_NOT_A_REPO", "message": "repo_path is not a git repository"}

    steps: List[Dict[str, Any]] = []

    ok, out = run_cmd(["git", "config", "--global", "--add", "safe.directory", str(repo)], repo)
    steps.append({"step": "safe_directory", **out})
    if not ok:
        return False, {"error_code": "GITOPS_SAFE_DIRECTORY_FAILED", "message": "failed to set safe.directory", "steps": steps}

    if fetch_remote:
        ok, out = run_cmd(["git", "fetch", remote], repo)
        steps.append({"step": "fetch", **out})
        if not ok:
            return False, {"error_code": "GITOPS_FETCH_FAILED", "message": "git fetch failed", "steps": steps}

    checkout_from = f"{remote}/{base_branch}" if fetch_remote else base_branch
    ok, out = run_cmd(["git", "checkout", "-B", branch, checkout_from], repo)
    steps.append({"step": "checkout", **out})
    if not ok:
        return False, {"error_code": "GITOPS_CHECKOUT_FAILED", "message": "git checkout failed", "steps": steps}

    if stage_all:
        ok, out = run_cmd(["git", "add", "-A"], repo)
        steps.append({"step": "add", **out})
        if not ok:
            return False, {"error_code": "GITOPS_ADD_FAILED", "message": "git add failed", "steps": steps}

    ok, diff_out = run_cmd(["git", "status", "--porcelain"], repo)
    steps.append({"step": "status", **diff_out})
    if not ok:
        return False, {"error_code": "GITOPS_STATUS_FAILED", "message": "git status failed", "steps": steps}

    changed_files = count_status_lines(diff_out.get("stdout", ""))
    commit_created = False
    if changed_files > 0:
        ok, out = run_cmd(["git", "commit", "-m", commit_message], repo)
        steps.append({"step": "commit", **out})
        if not ok:
            return False, {"error_code": "GITOPS_COMMIT_FAILED", "message": "git commit failed", "steps": steps}
        commit_created = True

    if push_enabled:
        ok, out = run_cmd(["git", "push", "-u", remote, branch], repo)
        steps.append({"step": "push", **out})
        if not ok:
            return False, {"error_code": "GITOPS_PUSH_FAILED", "message": "git push failed", "steps": steps}

    ok, head_out = run_cmd(["git", "rev-parse", "HEAD"], repo)
    steps.append({"step": "head", **head_out})
    if not ok:
        return False, {"error_code": "GITOPS_HEAD_FAILED", "message": "git rev-parse failed", "steps": steps}

    head_sha = first_line(head_out.get("stdout", ""))
    return True, {
        "status": "ok",
        "repo_path": str(repo),
        "branch": branch,
        "base_branch": base_branch,
        "remote": remote,
        "push": push_enabled,
        "fetch_remote": fetch_remote,
        "changed_files": changed_files,
        "commit_created": commit_created,
        "head_sha": head_sha,
        "steps": sanitize_steps(steps),
    }


def run_cmd(cmd: List[str], cwd: Path) -> Tuple[bool, Dict[str, Any]]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=GITOPS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, {"code": -1, "stdout": "", "stderr": "timeout"}
    except Exception:
        return False, {"code": -1, "stdout": "", "stderr": "exec_error"}

    return proc.returncode == 0, {
        "code": proc.returncode,
        "stdout": trim_output(proc.stdout),
        "stderr": trim_output(proc.stderr),
    }


def trim_output(value: str) -> str:
    text = (value or "").strip()
    if len(text) <= 800:
        return text
    return text[:800]


def sanitize_steps(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    safe_steps: List[Dict[str, Any]] = []
    for item in steps:
        safe_steps.append(
            {
                "step": item.get("step"),
                "code": item.get("code"),
                "stdout": item.get("stdout", ""),
                "stderr": item.get("stderr", ""),
            }
        )
    return safe_steps


def count_status_lines(status_stdout: str) -> int:
    lines = [line for line in status_stdout.splitlines() if line.strip()]
    return len(lines)


def first_line(value: str) -> str:
    for line in value.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def is_within_allowed_base(path: Path) -> bool:
    try:
        path.relative_to(GITOPS_ALLOWED_BASE)
        return True
    except Exception:
        return False


if __name__ == "__main__":
    HTTPServer((HOST, PORT), Handler).serve_forever()
