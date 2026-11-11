#!/bin/sh
set -eu
home="${HOME:-/tmp/oc-home}"
mkdir -p "$home/work"
cd "$home/work"
exec opencode "$@"
