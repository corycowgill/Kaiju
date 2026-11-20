# Write tools/sf/design/manifest_towers.js from the build summary + the validator's numbers.
# python3 tools/sf/design/towers_manifest.py <scratch>/summary.json <scratch>/validated.json
import json, sys, os
summ = json.load(open(sys.argv[1]))
val = json.load(open(sys.argv[2]))
ORDER = "transamerica_pyramid salesforce_tower bank_of_america_555_california tower_181_fremont millennium_tower one_rincon_hill embarcadero_center california_345 california_101 montgomery_44 one_market_spear_tower fremont_50 mckesson_plaza_one_post park_tower mission_555 market_525 one_sansome infinity_towers lumina russ_building pacbell_building shell_building hobart_building hilton_union_square marriott_marquis intercontinental_sf four_seasons_757_market st_regis_sf westin_st_francis fairmont_sf mark_hopkins hyatt_regency_embarcadero federal_building_sf burton_federal_building fox_plaza sentinel_building".split()
lines = ["// San Francisco landmark towers (design-towers): ready-to-paste lines for the level manifest (see src/levels/seattleManifest.js).",
         "// Procedural Blender 4.5 builds at true size: tools/sf/design/towers_lib.py + towers_build_a.py / _b.py / _c.py (blender -b -P ... -- [ids]);",
         "// footprints fitted to tools/sf/data/landmark_sites.json (OSM outlines, copied in towers_sites.json). All: metres, Y up, base y = 0,",
         "// centred X/Z on the lot, front +Z, LOD1 twin (no materials), palette atlas + one tiling facade map (two on some tier A), metal 0 on facades.",
         "// face: the compass word nearest the direction the model's +Z front should look. Where it differs from the sites file's frontBearing",
         "// the comment says why. trueHeightM = the exported bbox height.",
         "export const SF_TOWER_GLBS = ["]
for mid in ORDER:
    if mid not in summ or mid not in val:
        lines.append(f"  // {mid}: NOT BUILT")
        continue
    s, v = summ[mid], val[mid]
    w, h, d = v['size']
    key = ("ids: [" + ", ".join(f"'{i}'" for i in s['ids']) + "]") if s.get('ids') else f"id: '{mid}'"
    hs = ('%.2f' % h).rstrip('0').rstrip('.') if abs(h - round(h, 1)) > 1e-6 else '%.1f' % h
    note = (' ' + s['note']) if s.get('note') else ''
    lines.append(f"  {{ {key}, file: '{mid}.glb', trueHeightM: {hs}, face: '{s['face']}', stone: 0x{s['stone']:06x}, ready: true }}, "
                 f"// tier {s['tier']}, {w:.1f} x {d:.1f} m, {v['tris0']} / {v['tris1']} tris; {s['desc']}{note}")
lines.append("];")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest_towers.js')
open(out, 'w').write("\n".join(lines) + "\n")
print(out, len(lines) - 8, 'entries')
