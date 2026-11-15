#!/usr/bin/env bash
# Démonstration web des isométries : données calculées par le cœur du complément, page autonome (un seul fichier)
#   bash revit/demo/build.sh   ->   dist/pipefit-isometries-demo.html
set -euo pipefail
ici="$(cd "$(dirname "$0")" && pwd)"; racine="$(cd "$ici/../.." && pwd)"
mkdir -p "$racine/dist"
json="$(mktemp)"
dotnet run --project "$ici" -c Release -- "$json" >/dev/null
python3 - "$ici/web/page.html" "$json" "$racine/dist/pipefit-isometries-demo.html" <<'PY'
import sys
page, data, out = sys.argv[1:]
d = open(data, encoding='utf-8').read().replace('</', '<\\/')
open(out, 'w', encoding='utf-8').write(open(page, encoding='utf-8').read().replace('__DATA__', d))
PY
rm -f "$json"
echo "Démonstration : dist/pipefit-isometries-demo.html"
