"""Fetch DataSF building footprints (ynuv-fyni) and street trees (tkzw-k3nq). Usage: python3 fetch_datasf.py <outdir>"""
import sys, json, time, urllib.request, urllib.parse, os
OUT = sys.argv[1]
UA = {'User-Agent': 'level-tools/1.0'}
def get(url):
    for k in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
        except Exception as e:
            print('retry', e, file=sys.stderr); time.sleep(3 + 3 * k)
    raise SystemExit('failed ' + url)
def page(base, where, select, order, name):
    rows = []; off = 0
    while True:
        q = urllib.parse.urlencode({'$select': select, '$where': where, '$order': order, '$limit': 5000, '$offset': off})
        r = get(base + '?' + q)
        rows += r; off += 5000
        print(name, len(rows), flush=True)
        if len(r) < 5000: break
        time.sleep(1)
    json.dump(rows, open(os.path.join(OUT, name), 'w'))
if 'trees' in sys.argv[2:] or len(sys.argv) < 3:
    page('https://data.sf.gov/resource/tkzw-k3nq.json', 'latitude > 37.772 AND latitude < 37.8145 AND longitude > -122.4265 AND longitude < -122.383',
         'treeid,species,siteinfo,planttype,latitude,longitude,dbhrange,onstreet', 'treeid', 'datasf_trees.json')
if 'bld' in sys.argv[2:] or len(sys.argv) < 3:
    page('https://data.sf.gov/resource/ynuv-fyni.json', 'within_box(shape, 37.8150, -122.4630, 37.7440, -122.3830)',
         'sf16_bldgid,hgt_median_m,hgt_maxcm,hgt_meancm,gnd_min_m,shape', 'sf16_bldgid', 'datasf_buildings.json')
