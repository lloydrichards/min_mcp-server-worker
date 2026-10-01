"""Capture a bounded MCP subscription. Curl exit 0 can mean premature EOF."""
import argparse
import json
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("--seconds", type=int, default=12)
parser.add_argument("--expect-open", action="store_true")
parser.add_argument("--min-heartbeats", type=int, default=0)
args = parser.parse_args()
body = {
    "jsonrpc": "2.0",
    "id": "listen-repro",
    "method": "subscriptions/listen",
    "params": {
        "_meta": {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
        },
        "notifications": {"toolsListChanged": True},
    },
}
start = time.monotonic()
result = subprocess.run(
    [
        "curl", "-sS", "-N", "--max-time", str(args.seconds),
        "--write-out", "\n%{http_code}", args.url,
        "-H", "Content-Type: application/json",
        "-H", "Accept: application/json, text/event-stream",
        "-H", "Mcp-Protocol-Version: 2026-07-28",
        "-H", "Mcp-Method: subscriptions/listen",
        "--data", json.dumps(body),
    ],
    capture_output=True,
    text=True,
)
body_text, _, status = result.stdout.rpartition("\n")
measurement = {
    "url": args.url,
    "seconds": round(time.monotonic() - start, 3),
    "httpStatus": status,
    "curlExit": result.returncode,
    "body": body_text,
    "stderr": result.stderr,
}
print(json.dumps(measurement, indent=2))
if args.expect_open:
    if result.returncode != 28 or status != "200" or measurement["seconds"] < args.seconds - 0.5:
        raise SystemExit("FAIL: subscription ended before the client deadline")
    messages = [json.loads(frame[6:]) for frame in body_text.split("\n") if frame.startswith("data: ")]
    if not any(message.get("method") == "notifications/subscriptions/acknowledged" for message in messages):
        raise SystemExit("FAIL: subscription was not acknowledged")
    if any("result" in message or "error" in message for message in messages):
        raise SystemExit("FAIL: subscription completed or failed")
if body_text.count(": keepalive\n\n") < args.min_heartbeats:
    raise SystemExit("FAIL: expected heartbeat comments were missing")
