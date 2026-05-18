#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'HELP'
Usage:
  ./scripts/ai-chat-stream.sh [message]

Optional environment overrides:
  API_BASE_URL   Default: http://localhost:${API_PORT:-4000}
  API_PORT       Used only when API_BASE_URL is unset (default: 4000)
  SESSION_ID     Default: s1
  USER_ID        Default: demo-user
  REQUEST_ID     Default: stream-<epoch-seconds>
  AUTH_SCOPE     Optional auth scope string included in userContext

Example:
  SESSION_ID=session-42 REQUEST_ID=req-42 ./scripts/ai-chat-stream.sh "recommend running shoes under 100"
HELP
  exit 0
fi

api_base_url="${API_BASE_URL:-http://localhost:${API_PORT:-4000}}"
api_base_url="${api_base_url%/}"
session_id="${SESSION_ID:-s1}"
user_id="${USER_ID:-demo-user}"
request_id="${REQUEST_ID:-stream-$(date +%s)}"
auth_scope="${AUTH_SCOPE:-customer}"
message="${1:-recommend running shoes under 100}"

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

message_json="$(json_escape "$message")"
session_id_json="$(json_escape "$session_id")"
user_id_json="$(json_escape "$user_id")"
request_id_json="$(json_escape "$request_id")"
auth_scope_json="$(json_escape "$auth_scope")"

payload="{\"message\":${message_json},\"sessionId\":${session_id_json},\"requestId\":${request_id_json},\"userContext\":{\"userId\":${user_id_json},\"authScope\":${auth_scope_json}}}"

echo "POST ${api_base_url}/ai/chat/stream"
echo "requestId=${request_id} sessionId=${session_id}"
echo ""

curl -N -sS \
  -X POST "${api_base_url}/ai/chat/stream" \
  -H 'Content-Type: application/json' \
  -H "x-request-id: ${request_id}" \
  --data-binary "${payload}"

echo ""
