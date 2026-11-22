# icons_manifest.py - writes manifest_icons.js from the per-model stats the builds leave in the scratchpad
# (python3 icons_manifest.py). Heights are the exported bbox heights.
import json, os
SCR = '/tmp/claude-0/-home-user-Kaiju/7f476fa8-12a3-5755-a2d5-0a21ceb1bd4a/scratchpad/tk_icons'
OUT = '/home/user/Kaiju/assets/buildings/tokyo'
ORDER = "tokyo_station national_diet_building imperial_palace_nijubashi imperial_palace_kyuden fujimi_yagura edo_castle_otemon kabukiza wako_ginza ginza_place mitsukoshi_ginza zojoji tsukiji_honganji hie_shrine atago_shrine tokyo_international_forum imperial_hotel ministry_of_justice_red_brick kantei supreme_court_japan national_theatre bank_of_japan mitsukoshi_nihonbashi nihonbashi_bridge takashimaya_nihonbashi rainbow_bridge odaiba_statue_of_liberty aqua_city_odaiba kachidoki_bridge tsukiji_outer_market toyosu_market hamarikyu_teahouse takeshiba_pier takanawa_gateway_station shimbashi_sl_plaza ginza_six".split()
lines = ["// Tokyo landmark models by design-icons (tools/tokyo/design/icons_build_*.py + icons_lib.py, Blender 4.5).",
         "// Paste into the level manifest. All: metres, Y up, base y = 0 (bridges / waterline models: y 0 = water level), centred X/Z, front +Z, LOD1 twin.",
         "// Every material carries an emissive map (dusk: lit windows, lanterns, floodlights; emissiveFactor 1, scale it in the look layer).",
         "// trueHeightM = exported bbox height; face = compass word the model's +Z front should point to.",
         "export const TOKYO_ICON_GLBS = ["]
for id in ORDER:
    p = os.path.join(SCR, 'stats_%s.json' % id)
    if not os.path.exists(p) or not os.path.exists(os.path.join(OUT, id + '.glb')):
        lines.append("  // %s: not built" % id); continue
    s = json.load(open(p)); w, h, d = s['bbox']
    key = ("ids: [%s]" % ', '.join("'%s'" % i for i in s['ids'])) if s.get('ids') else "id: '%s'" % id
    ex = s.get('extra') or ''
    if s.get('waterline'): ex += 'onWater: true, waterline: true, '
    elif s.get('water'): ex += 'onWater: true, '
    lines.append("  { %s, file: '%s.glb', trueHeightM: %s, face: '%s', stone: 0x%06x, %sready: true }, // tier %s, %s x %s m, %d / %d tris; %s" % (
        key, id, ('%.2f' % h).rstrip('0').rstrip('.'), s['face'], s['stone'], ex, s['tier'], ('%.1f' % w).rstrip('0').rstrip('.'), ('%.1f' % d).rstrip('0').rstrip('.'), s['tris0'], s['tris1'], s['desc']))
lines.append("];")
open('/home/user/Kaiju/tools/tokyo/design/manifest_icons.js', 'w').write('\n'.join(lines) + '\n')
print(sum(1 for l in lines if 'ready' in l), 'models in manifest')
