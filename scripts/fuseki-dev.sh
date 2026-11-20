#!/usr/bin/env bash
# Local Apache Jena Fuseki for development.
#
# Mirrors the production service shape from hackers4peace/vps:
#   /catalog/sparql  read-only query endpoint
#   /catalog/update  SPARQL Update endpoint (no auth on localhost)
#   /catalog/data    read-only Graph Store Protocol endpoint
#
# The TDB2 database lives under tmp/fuseki-dev/ and survives restarts.
#
# Usage:
#   scripts/fuseki-dev.sh [start]   start in the background (default)
#   scripts/fuseki-dev.sh run       run in the foreground
#   scripts/fuseki-dev.sh stop      stop the background instance
#   scripts/fuseki-dev.sh restart   stop, then start
#   scripts/fuseki-dev.sh status    show PID/URLs and whether the port is open
#
# Environment:
#   FUSEKI_DEV_PORT  HTTP port, default 3031
#   FUSEKI_DEV_BASE  state directory, default tmp/fuseki-dev
#
# Normally used through devbox:
#   devbox run fuseki:dev
#   devbox run fuseki:dev -- stop

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PORT=${FUSEKI_DEV_PORT:-3031}
BASE=${FUSEKI_DEV_BASE:-"$ROOT/tmp/fuseki-dev"}
if [[ "$BASE" != /* ]]; then
  BASE="$ROOT/$BASE"
fi
DATA="$BASE/catalog"
CONFIG="$BASE/config.ttl"
PID_FILE="$BASE/fuseki.pid"
LOG_FILE="$BASE/fuseki.log"
URL="http://127.0.0.1:$PORT/catalog"

# Match the production service's heap and let callers override it.
export JVM_ARGS=${JVM_ARGS:--Xmx1G}

usage() {
  sed -n '11,24p' "$0" | sed 's/^# \{0,1\}//'
}

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null || true)
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

require_fuseki() {
  if ! command -v fuseki-server >/dev/null 2>&1; then
    echo "fuseki-server not found; run this through devbox: devbox run fuseki:dev" >&2
    exit 1
  fi
}

write_config() {
  mkdir -p "$BASE" "$DATA"
  cat >"$CONFIG" <<EOF
@prefix fuseki: <http://jena.apache.org/fuseki#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix tdb2: <http://jena.apache.org/2016/tdb#> .

<#service> rdf:type fuseki:Service ;
  fuseki:name "catalog" ;

  fuseki:endpoint [
    fuseki:operation fuseki:query ;
    fuseki:name "sparql"
  ] ;

  # Localhost-only development writer endpoint; no credentials.
  fuseki:endpoint [
    fuseki:operation fuseki:update ;
    fuseki:name "update"
  ] ;

  fuseki:endpoint [
    fuseki:operation fuseki:gsp_r ;
    fuseki:name "data"
  ] ;

  fuseki:dataset <#dataset> .

<#dataset> rdf:type tdb2:DatasetTDB2 ;
  tdb2:location "$DATA" ;
  tdb2:unionDefaultGraph false .
EOF
}

start() {
  if is_running; then
    echo "Fuseki dev already running (pid $(cat "$PID_FILE"))"
    echo "  query:  $URL/sparql"
    echo "  update: $URL/update"
    return 0
  fi
  rm -f "$PID_FILE"

  if port_open; then
    echo "port $PORT is already in use; set FUSEKI_DEV_PORT to another port" >&2
    exit 1
  fi

  require_fuseki
  write_config
  export FUSEKI_BASE="$BASE"

  echo "starting Fuseki dev on $URL"
  nohup fuseki-server \
    --config "$CONFIG" \
    --localhost \
    --port "$PORT" \
    >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  local deadline=$((SECONDS + 60))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Fuseki exited while starting; last log lines:" >&2
      tail -n 40 "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if port_open; then
      echo "Fuseki dev running (pid $(cat "$PID_FILE"))"
      echo "  query:  $URL/sparql"
      echo "  data:   $URL/data"
      echo "  update: $URL/update"
      echo "  log:    $LOG_FILE"
      echo "  stop:   devbox run fuseki:dev -- stop"
      return 0
    fi
    sleep 0.5
  done

  echo "Fuseki did not become ready within 60s; last log lines:" >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
}

run() {
  if port_open; then
    echo "port $PORT is already in use; set FUSEKI_DEV_PORT to another port" >&2
    exit 1
  fi
  require_fuseki
  write_config
  export FUSEKI_BASE="$BASE"
  echo "Fuseki dev foreground on $URL (Ctrl+C to stop)"
  exec fuseki-server \
    --config "$CONFIG" \
    --localhost \
    --port "$PORT"
}

stop() {
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "Fuseki dev is not running"
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  echo "stopping Fuseki dev (pid $pid)"
  kill "$pid" 2>/dev/null || true

  local deadline=$((SECONDS + 15))
  while kill -0 "$pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do
    sleep 0.3
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "Fuseki did not stop in 15s; sending SIGKILL" >&2
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

status() {
  if is_running; then
    echo "Fuseki dev running (pid $(cat "$PID_FILE"))"
  else
    echo "Fuseki dev is not running"
  fi
  echo "  query:  $URL/sparql"
  echo "  data:   $URL/data"
  echo "  update: $URL/update"
  echo "  base:   $BASE"
  echo "  log:    $LOG_FILE"
  if port_open; then
    echo "  port:   $PORT open"
  else
    echo "  port:   $PORT closed"
  fi
}

case "${1:-start}" in
  start) start ;;
  run) run ;;
  stop) stop ;;
  restart)
    stop
    start
    ;;
  status) status ;;
  help | -h | --help) usage ;;
  *)
    echo "unknown command: $1" >&2
    usage >&2
    exit 1
    ;;
esac
