#!/usr/bin/env bash
# Restore the existing frozen-render test dependency from immutable official bytes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_DIR=/usr/share/fonts/opentype/noto
BASE=https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTC
REGULAR=b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a
BOLD=faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb
MODE="${1:-install}"
[[ "$MODE" = install || "$MODE" = --verify ]] || { echo 'Usage: setup-android-ci-fonts.sh [--verify]' >&2; exit 2; }
checksums() { printf '%s  %s/NotoSansCJK-Regular.ttc\n%s  %s/NotoSansCJK-Bold.ttc\n' "$REGULAR" "$1" "$BOLD" "$1"; }
if ! checksums "$FONT_DIR" | sha256sum --check --status 2>/dev/null; then
  [[ "$MODE" = install ]] || { echo 'Pinned CI fonts are absent or have different bytes' >&2; exit 1; }
  TEMP="$(mktemp -d)"
  trap 'rm -rf "$TEMP"' EXIT
  for name in NotoSansCJK-Regular.ttc NotoSansCJK-Bold.ttc; do
    curl --fail --location --retry 2 --connect-timeout 10 --max-time 120 "$BASE/$name" -o "$TEMP/$name"
  done
  checksums "$TEMP" | sha256sum --check
  sudo install -d "$FONT_DIR"
  sudo install -m 0644 "$TEMP/NotoSansCJK-Regular.ttc" "$TEMP/NotoSansCJK-Bold.ttc" "$FONT_DIR/"
  fc-cache -f "$FONT_DIR"
fi
checksums "$FONT_DIR" | sha256sum --check
cd "$ROOT"
FONT_VERIFY_MODE="$MODE" node --input-type=module - <<'NODE'
import assert from 'node:assert/strict';
import {GlobalFonts} from '@napi-rs/canvas';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const base='/usr/share/fonts/opentype/noto/';
const files=['NotoSansCJK-Regular.ttc','NotoSansCJK-Bold.ttc'];
for(const name of files)assert.ok(GlobalFonts.registerFromPath(base+name),`Font registration failed: ${name}`);
const registeredFamilies=GlobalFonts.families.filter(font=>font.family.startsWith('Noto Sans CJK ')).map(font=>font.family);
assert.ok(registeredFamilies.includes('Noto Sans CJK JP'),'Expected first-face embedded TTC family is absent');
const report={sourceCommit:'523d033d6cb47f4a80c58a35753646f5c3608a78',release:'Sans2.004',files:files.map(name=>({name,sha256:createHash('sha256').update(readFileSync(base+name)).digest('hex')})),registeredFamilies,embeddedFamilyProbe:'passed',systemFontLoading:'unchanged',nodePreload:'none'};
if(process.env.FONT_VERIFY_MODE!=='--verify'){
 mkdirSync('build/android-ci',{recursive:true});
 writeFileSync('build/android-ci/font-report.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({registeredFamilies,files:report.files}));
console.log('Pinned Noto CJK font probe passed');
NODE
