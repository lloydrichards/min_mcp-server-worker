"""Capture a bounded MCP subscription. Curl exit 0 can mean premature EOF."""
import argparse
import json
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("--seconds", type=int, default=12)
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
print(json.dumps({
    "url": args.url,
    "seconds": round(time.monotonic() - start, 3),
    "httpStatus": status,
    "curlExit": result.returncode,
    "body": body_text,
    "stderr": result.stderr,
}, indent=2))
