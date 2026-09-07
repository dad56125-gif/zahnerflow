"""Machine-first CLI: JSON stdout, JSON errors stderr, no in-process runtime imports."""

from __future__ import annotations

import argparse
import json
import math
from importlib.metadata import version
import os
from pathlib import Path
import sys
import time
from urllib.parse import quote, urlencode

from .client import CommandError, RuntimeClient


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise CommandError("INVALID_ARGUMENT", message, exit_code=2)


def positive_number(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a positive finite number")
    return number


def parser():
    root = Parser(prog="zahnerflow", description="Control the running ZahnerFlow App/backend. Results: JSON; watch: NDJSON.")
    root.add_argument("--version", action="version", version=version("zahnerflow-runtime"))
    root.add_argument("--url", default=os.environ.get("ZAHNERFLOW_URL", "http://127.0.0.1:3001"), help="runtime origin (or ZAHNERFLOW_URL)")
    root.add_argument("--timeout", type=positive_number, default=10, help="HTTP timeout in seconds")
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("health", "status", "capabilities", "schema", "devices", "users", "reset"):
        commands.add_parser(name)
    workflow = commands.add_parser("workflow").add_subparsers(dest="action", required=True)
    workflow.add_parser("list")
    workflow.add_parser("get").add_argument("id")
    history = commands.add_parser("history")
    history.add_argument("--page", type=int, default=1)
    history.add_argument("--limit", type=int, default=20)
    for name in ("plan", "estimate", "run"):
        command = commands.add_parser(name)
        source = command.add_mutually_exclusive_group(required=True)
        source.add_argument("--file", help="JSON payload path; '-' reads stdin")
        source.add_argument("--workflow", help="saved workflow ID")
        if name == "run":
            command.add_argument("--owner")
            command.add_argument("--project")
            command.add_argument("--sample")
            command.add_argument("--from-step", type=int, help="zero-based backend unrolledIndex")
            command.add_argument("--source", choices=("cli", "agent"), default="cli")
            command.add_argument("--force-missing-metadata", action="store_true", help="explicitly allow missing owner/project/sample")
    for name in ("pause", "resume", "cancel", "report"):
        commands.add_parser(name).add_argument("id", nargs="?", help="execution ID; defaults to the current execution")
    watch = commands.add_parser("watch")
    watch.add_argument("--execution", help="pin to this execution; otherwise capture the current execution")
    watch.add_argument("--interval", type=positive_number, default=1)
    watch.add_argument("--duration", type=positive_number, default=120, help="maximum observation seconds")
    watch.add_argument("--until-terminal", action="store_true", help="stop at completed/failed/cancelled")
    device = commands.add_parser("device")
    device.add_argument("name", choices=("zahner", "furnace", "mfc"))
    device.add_argument("action", choices=("status", "connect", "disconnect"))
    config = device.add_mutually_exclusive_group()
    config.add_argument("--file", help="connection config JSON path, or '-' for stdin")
    config.add_argument("--simulate", action="store_true", help="connect the built-in simulator explicitly")
    request = commands.add_parser("request", help="access any existing API operation, including device controls")
    request.add_argument("method", choices=("GET", "POST", "PUT", "DELETE", "PATCH"))
    request.add_argument("path", help="API path and optional query string")
    request.add_argument("--file", help="JSON body path, or '-' for stdin")
    return root


def emit(value, *, error=False):
    stream = sys.stderr if error else sys.stdout
    stream.write(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")
    stream.flush()


def read_payload(path):
    try:
        text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8-sig")
        value = json.loads(text, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Invalid JSON number: {value}")))
    except (OSError, ValueError) as error:
        raise CommandError("INVALID_INPUT", str(error), exit_code=2) from error
    if not isinstance(value, dict):
        raise CommandError("INVALID_INPUT", "JSON payload must be an object", exit_code=2)
    return value


def execution_id(client, requested=None):
    if requested:
        return quote(requested, safe="")
    snapshot = client.request("GET", "/api/runtime/snapshot")
    if not snapshot.get("executionId"):
        raise CommandError("NO_EXECUTION", "No current execution; specify an execution ID or start one")
    return quote(snapshot["executionId"], safe="")


def watch_execution(client, args):
    deadline = time.monotonic() + args.duration
    pinned = args.execution
    previous = None
    while True:
        # Bound each request by the remaining watch duration, too.
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            if args.until_terminal:
                raise CommandError("WATCH_TIMEOUT", "Execution did not reach a terminal state within the observation duration", exit_code=4)
            return
        client.timeout = min(args.timeout, remaining)
        path = f"/api/executions/{quote(pinned, safe='')}" if pinned else "/api/runtime/snapshot"
        snapshot = client.request("GET", path)
        if not pinned and snapshot.get("executionId"):
            pinned = snapshot["executionId"]
        comparable = {key: value for key, value in snapshot.items() if key not in {"timestamp", "snapshotSequence"}}
        if comparable != previous:
            emit(snapshot)
            previous = comparable
        if args.until_terminal and snapshot.get("status") in {"completed", "failed", "cancelled"}:
            if snapshot["status"] != "completed":
                raise CommandError("EXECUTION_" + snapshot["status"].upper(), snapshot.get("error") or snapshot["status"], exit_code=3)
            return
        time.sleep(min(args.interval, max(0, deadline - time.monotonic())))


def dispatch(client, args):
    endpoints = {"health": "/health", "status": "/api/runtime/snapshot", "capabilities": "/api/runtime/capabilities",
        "schema": "/openapi.json", "devices": "/api/runtime/devices", "users": "/api/users"}
    if args.command in endpoints:
        return client.request("GET", endpoints[args.command])
    if args.command == "workflow":
        return client.request("GET", "/api/workflows/summaries" if args.action == "list" else f"/api/workflows/{quote(args.id, safe='')}")
    if args.command == "history":
        if args.page < 1 or not 1 <= args.limit <= 200:
            raise CommandError("INVALID_ARGUMENT", "page >= 1 and limit between 1 and 200 required", exit_code=2)
        return client.request("GET", "/api/executions?" + urlencode({"page": args.page, "limit": args.limit}))
    if args.command in {"plan", "estimate", "run"}:
        body = read_payload(args.file) if args.file else {"workflowId": args.workflow}
        if args.command != "run":
            body = {key: body[key] for key in ("nodes", "workflowId", "autoStartupConfig") if key in body}
            return client.request("POST", "/api/executions/" + ("unroll-preview" if args.command == "plan" else "estimate"), body)
        body["commandSource"] = args.source
        if args.owner is not None:
            body["ownerName"] = args.owner
        if args.project is not None or args.sample is not None:
            if not isinstance(body.get("pathConfig", {}), dict):
                raise CommandError("INVALID_INPUT", "pathConfig must be an object", exit_code=2)
            body.setdefault("pathConfig", {})
            for key, value in (("projectName", args.project), ("individualName", args.sample)):
                if value is not None:
                    body["pathConfig"][key] = value
        if args.from_step is not None:
            body["startFromUnrolledIndex"] = args.from_step
        if args.force_missing_metadata:
            body["forceStartWithMissingRunMetadata"] = True
        return client.request("POST", "/api/executions", body)
    if args.command == "reset":
        return client.request("POST", "/api/executions/reset")
    if args.command in {"pause", "resume", "cancel", "report"}:
        path = "/api/executions/" + execution_id(client, args.id)
        method = "DELETE" if args.command == "cancel" else "GET" if args.command == "report" else "PUT"
        return client.request(method, path if args.command == "cancel" else path + "/" + args.command)
    if args.command == "device":
        name = "zahner-zennium" if args.name == "zahner" else args.name
        path = f"/api/devices/{name}/"
        if args.action != "connect":
            if args.file or args.simulate:
                raise CommandError("INVALID_ARGUMENT", "Connection options apply only to device connect", exit_code=2)
            return client.request("GET" if args.action == "status" else "POST", path + ("runtime/status" if args.action == "status" else "disconnect"))
        if not args.file and not args.simulate:
            raise CommandError("INVALID_ARGUMENT", "device connect requires --file CONFIG or --simulate", exit_code=2)
        body = read_payload(args.file) if args.file else ({"host": "simulator"} if args.name == "zahner" else {"port": "COM_SIMULATOR"})
        return client.request("POST", path + "connect", body)
    if args.command == "request":
        return client.request(args.method, args.path, read_payload(args.file) if args.file else None)
    raise CommandError("INVALID_ARGUMENT", "Unknown command", exit_code=2)


def main(argv=None):
    for stream in (sys.stdout, sys.stderr, sys.stdin):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    try:
        args = parser().parse_args(argv)
        client = RuntimeClient(args.url, args.timeout)
        if args.command == "watch":
            watch_execution(client, args)
        else:
            emit(dispatch(client, args))
        return 0
    except CommandError as error:
        emit({"error": error.payload}, error=True)
        return error.exit_code
    except KeyboardInterrupt:
        emit({"error": {"code": "INTERRUPTED", "message": "Client interrupted; server execution continues"}}, error=True)
        return 130
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
