# Write tools/tokyo/design/manifest_towers.js from the build summary + the validator's numbers.
# python3 tools/tokyo/design/towers_manifest.py <scratch>/summary.json <scratch>/validated.json
import json, sys, os
summ = json.load(open(sys.argv[1]))
val = json.load(open(sys.argv[2]))
ORDER = "tokyo_tower tokyo_skytree azabudai_hills_mori_jp_tower toranomon_hills_mori_tower toranomon_hills_station_tower tokyo_midtown_yaesu tokiwabashi_tower marunouchi_building shin_marunouchi_building jp_tower_kitte gran_tokyo otemachi_tower tokyo_midtown_hibiya dentsu_building nittele_tower shiodome_city_center shiodome_media_tower tokyo_shiodome_building kasumigaseki_building kasumigaseki_common_gate sanno_park_tower izumi_garden_tower ark_mori_building atago_green_hills_mori_tower world_trade_center_hamamatsucho tokyo_port_city_takeshiba nec_supertower st_lukes_tower the_tokyo_towers harumi_triton river_city_21 prince_park_tower fuji_tv_building tokyo_metropolitan_police_hq".split()
lines = ["// Tokyo landmark towers (design-towers): ready-to-paste lines for the level manifest (line shape as tools/sf/design/manifest_towers.js).",
         "// Procedural Blender 4.5 builds at true size: tools/tokyo/design/towers_lib.py + towers_build_a.py / _a2.py / _b.py / _c.py (blender -b -P ... -- [ids]);",
         "// plan sizes fitted to tools/tokyo/data/landmark_sites.json (wMetres / dMetres) where that file had the site at build time. All: metres, Y up,",
         "// base y = 0, centred X/Z on the lot, front +Z, LOD1 twin (no materials), palette atlas + one or two tiling facade maps (metal 0 on facades).",
         "// DUSK: every material carries an emissive map (lit-window scatter on the facade tiles; lobby glass, deck lighting, floodlit steel and red",
         "// aircraft warning lights in the palette), emissive factor 1: the level look layer scales it. Base colour stays daytime.",
         "// face: the compass word nearest the direction the model's +Z front should look (from frontBearing when the sites file had it).",
         "// trueHeightM = the exported bbox height.",
         "export const TOKYO_TOWER_GLBS = ["]
for mid in ORDER:
    if mid not in summ or mid not in val or val[mid].get('missing'):
        lines.append(f"  // {mid}: NOT BUILT")
        continue
    s, v = summ[mid], val[mid]
    w, h, d = v['size']
    key = f"id: '{mid}'" + ((", ids: [" + ", ".join(f"'{i}'" for i in s['ids']) + "]") if s.get('ids') else '')
    hs = ('%.2f' % h).rstrip('0').rstrip('.') if abs(h - round(h, 1)) > 1e-6 else '%.1f' % h
    note = (' ' + s['note']) if s.get('note') else ''
    lines.append(f"  {{ {key}, file: '{mid}.glb', trueHeightM: {hs}, face: '{s['face']}', stone: 0x{s['stone']:06x}, ready: true }}, "
                 f"// tier {s['tier']}, {w:.1f} x {d:.1f} m, {v['tris0']} / {v['tris1']} tris; {s['desc']}{note}")
lines.append("];")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest_towers.js')
open(out, 'w').write("\n".join(lines) + "\n")
print(out, len(lines) - 10, 'entries')
