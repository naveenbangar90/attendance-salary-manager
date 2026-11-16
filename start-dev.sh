#!/bin/bash
# Start the Attendance dev server on THIS machine, detached from whatever shell (or Claude
# session) launched it. Safe to run repeatedly — if the server is already up it just reports
# the URL instead of failing on "port in use".
#
#   ./start-dev.sh          start (or report already-running)
#   ./start-dev.sh stop     stop it
#   ./start-dev.sh restart  stop then start
#   ./start-dev.sh status   is it up?

set -u

APP_DIR="/Users/mac/Attendance"
PORT=5173
NODE="/usr/local/bin/node"
VITE="$APP_DIR/node_modules/vite/bin/vite.js"
LOG="$APP_DIR/dev-server.log"
URL="http://localhost:$PORT"

is_up() { curl -s -o /dev/null --max-time 2 "$URL/"; }

pids_on_port() { lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null; }

stop_server() {
  local pids
  pids="$(pids_on_port)"
  if [ -n "$pids" ]; then
    echo "Stopping PID(s): $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null
    sleep 1
    pids="$(pids_on_port)"
    # shellcheck disable=SC2086
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  fi
  echo "Stopped."
}

start_server() {
  if is_up; then
    echo "Already running → $URL"
    exit 0
  fi

  # A listener that isn't answering HTTP is a stale process — clear it.
  if [ -n "$(pids_on_port)" ]; then
    echo "Port $PORT held by a stale process; clearing it."
    stop_server
  fi

  [ -x "$NODE" ] || { echo "node not found at $NODE"; exit 1; }
  [ -f "$VITE" ] || { echo "vite not installed — run: cd $APP_DIR && npm install"; exit 1; }

  cd "$APP_DIR" || exit 1
  # setsid detaches from the controlling terminal so the server outlives the launching shell.
  nohup "$NODE" "$VITE" --host 127.0.0.1 --port "$PORT" --strictPort >"$LOG" 2>&1 &
  disown

  # Wait for it to actually answer before claiming success.
  for _ in $(seq 1 30); do
    sleep 0.5
    if is_up; then
      echo "Started → $URL   (log: $LOG)"
      exit 0
    fi
  done

  echo "Failed to start within 15s. Last lines of $LOG:"
  tail -20 "$LOG"
  exit 1
}

case "${1:-start}" in
  stop)    stop_server ;;
  restart) stop_server; sleep 1; start_server ;;
  status)
    if is_up; then echo "UP   → $URL  (PID $(pids_on_port))"
    else echo "DOWN → run: $APP_DIR/start-dev.sh"; fi ;;
  *)       start_server ;;
esac
