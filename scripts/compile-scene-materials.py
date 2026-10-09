"""Append imagegen forest/ice materials while preserving every v0.20 atlas crop.

Compilation is limited to crop, resample, existing-palette encoding and packing.
The old 13 material frames and 39 quiet floor crops retain their decoded pixels.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / 'artifacts/v0210-scene-source'
BASELINE = SOURCE_DIR / 'scene-materials-v020-protected.png'
BASELINE_MANIFEST = SOURCE_DIR / 'scene-materials-v020-protected.manifest.json'
NEW_THEMES = ['forest_depot', 'ice_vault']
TILE_BASE_Y, TILE_COLUMNS, FRAME_COLUMNS = 512, 8, 4
WIDTH, HEIGHT, FRAME_SIZE, TILE_SIZE = 512, 960, 128, 64
EXTENSION_TILE_BASE_Y = 896
baseline_data = BASELINE.read_bytes()
baseline_manifest = json.loads(BASELINE_MANIFEST.read_text())
assert hashlib.sha256(baseline_data).hexdigest() == baseline_manifest['sha256'], 'Protected v0.20 atlas changed'
baseline = Image.open(BASELINE)
assert baseline.mode == 'P' and baseline.size == (512, 832)
# Preserve its palette indices and colors exactly. Only new source crops are
# quantized, using this same protected palette; old art is never re-encoded in RGB.
atlas = Image.new('P', (WIDTH, HEIGHT), baseline.getpixel((384, 384)))
atlas.putpalette(baseline.getpalette())
atlas.paste(baseline, (0, 0))
# Bilinear filtering may sample one pixel beyond a source crop. Reproduce the
# old atlas's clamped bottom row before adding a separate quiet-tile row.
atlas.paste(baseline.crop((0, 831, 512, 832)), (0, 832))
entries = list(baseline_manifest['entries'])
sources = []
for offset, theme in enumerate(NEW_THEMES):
    index = len(baseline_manifest['themes']) + offset
    source_path = SOURCE_DIR / f'{theme}-generated.png'
    source = Image.open(source_path).convert('RGB')
    panel_box = (0, 0, source.width, source.height)
    frame_origin = (index % FRAME_COLUMNS * FRAME_SIZE, index // FRAME_COLUMNS * FRAME_SIZE)
    # Keep original blank one-pixel guards adjacent to existing frame/tile crops.
    frame = source.resize((FRAME_SIZE - 2, FRAME_SIZE - 2), Image.Resampling.LANCZOS)
    atlas.paste(frame.quantize(palette=baseline, dither=Image.Dither.NONE), (frame_origin[0] + 1, frame_origin[1] + 1))
    variants = []
    for variant, (x, y) in enumerate(((.25, .25), (.40, .25), (.325, .40))):
        crop = tuple(round(n) for n in (x * source.width, y * source.height, (x + .35) * source.width, (y + .35) * source.height))
        target = offset * 3 + variant
        origin = (target % TILE_COLUMNS * TILE_SIZE, EXTENSION_TILE_BASE_Y + target // TILE_COLUMNS * TILE_SIZE)
        tile = source.crop(crop).resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
        atlas.paste(tile.quantize(palette=baseline, dither=Image.Dither.NONE), origin)
        variants.append({'variant': variant, 'panelCrop': crop, 'atlasOrigin': origin})
    entries.append({'theme': theme, 'source': str(source_path.relative_to(ROOT)), 'sourcePanelCrop': panel_box, 'frameAtlasOrigin': frame_origin, 'variants': variants})
    sources.append({'theme': theme, 'path': str(source_path.relative_to(ROOT)), 'sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(), 'dimensions': source.size})
# Mechanical protection, independent of the rendering tests.
for entry in baseline_manifest['entries']:
    for origin, size in [(entry['frameAtlasOrigin'], FRAME_SIZE)] + [(variant['atlasOrigin'], TILE_SIZE) for variant in entry['variants']]:
        box = (origin[0], origin[1], origin[0] + size, origin[1] + size)
        assert atlas.crop(box).convert('RGB').tobytes() == baseline.crop(box).convert('RGB').tobytes(), entry['theme']
output = ROOT / 'assets/scene-materials.png'
atlas.save(output, optimize=True)
data = output.read_bytes()
assert len(data) <= len(baseline_data) + 50 * 1024, 'Scene extension exceeds its 50KiB allocation'
manifest = {
    **baseline_manifest,
    'schema': 'warehouse-scene-art-v021',
    'width': WIDTH, 'height': HEIGHT, 'tileBaseY': TILE_BASE_Y, 'tileColumns': TILE_COLUMNS, 'frameColumns': FRAME_COLUMNS,
    'extensionTileBaseY': EXTENSION_TILE_BASE_Y, 'extensionThemeStart': len(baseline_manifest['themes']),
    'newFramePadding': 1, 'legacyBottomClampRow': 832,
    'themes': baseline_manifest['themes'] + NEW_THEMES, 'entries': entries,
    'extensionSources': sources,
    'extensionPrompt': 'artifacts/v0210-scene-source/generation-prompts.json',
    'protectedSceneAtlas': str(BASELINE.relative_to(ROOT)),
    'protectedSceneAtlasSha256': baseline_manifest['sha256'],
    'protectedSceneAtlasBytes': len(baseline_data), 'addedBytes': len(data) - len(baseline_data),
    'compilation': 'Protected v0.20 palette and decoded crops retained exactly. New source artwork only: crop, LANCZOS resize, existing-palette PNG encoding without dithering, append-only atlas packing. No redraw, recoloring, mirroring, rotation, generated noise, or changes to previous material crops.',
    'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
}
output.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({key: manifest[key] for key in ('bytes', 'addedBytes', 'sha256', 'width', 'height')}, indent=2))
