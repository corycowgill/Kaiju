#!/bin/sh
# Rebuild every SF level file from the scratchpad data. Usage: sh run_all.sh <scratch sf_osm dir> [from-stage: 2|3]
set -e
S=$1; HERE=$(cd "$(dirname "$0")" && pwd); A=$HERE/../../../assets/levels; DATA=$HERE/../data
[ "${2:-2}" -le 2 ] && python3 -I -u $HERE/gen_layout.py $S/prep.pickle $HERE x x $S/stage2.pickle | grep -E "roads |graph|dropped|MISSING|buildings out" | cut -c1-260
python3 -I -u $HERE/gen_layout2.py $S/prep.pickle $HERE $S/stage2.pickle $A/sf_layout.json $DATA/landmark_sites.json | grep -E "^ ring |wrote|!!" | cut -c1-400
python3 -I $HERE/gen_trees.py $S/prep.pickle $HERE $S/stage2.pickle $A/sf_layout.json $A/sf_trees.json | tail -1
python3 -I $HERE/gen_detail.py $S/prep.pickle $HERE $S/stage2.pickle $A/sf_layout.json $A/sf_detail.json | tail -1
python3 -I $HERE/gen_surround.py $S/prep.pickle $HERE $S/dem $A/sf_surround.json | head -1
python3 $HERE/validate.py $A $HERE/../SPEC.md | grep -v "^  " | tail -25
