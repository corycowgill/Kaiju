#!/bin/bash
# Voices the new kaiju lines (script/05_* onward) in resumable runs: rebuild, voice what is unvoiced, repeat.
# A run that dies (GPU memory) is restarted; each run's suspect list is kept as out/suspect_new_<n>.json.
cd C:/Users/coryc/kaiju3/Kaiju
for n in 1 2 3 4 5 6 7 8 9 10; do
  node tools/vo/build.mjs >> tools/vo/out/tts_new.log 2>&1
  left=$(node -e "const u=require('./tools/vo/out/utterances.json');let d={};try{d=require('./tools/vo/out/durations.json')}catch(e){};const fs=require('fs');console.log(u.filter(x=>!(d[x.id]>0&&fs.existsSync('assets/vo/'+x.id+'.mp3'))).length)")
  echo "=== run $n: $left to voice $(date)" >> tools/vo/out/tts_new.log
  [ "$left" = "0" ] && break
  ../devtools/vo/venv_q/Scripts/python -u tools/vo/tts.py >> tools/vo/out/tts_new.log 2>&1
  echo "=== run $n exit $? $(date)" >> tools/vo/out/tts_new.log
  cp tools/vo/out/suspect.json tools/vo/out/suspect_new_$n.json
  [ -f tools/vo/out/STOP ] && break
  sleep 20
done
node tools/vo/build.mjs >> tools/vo/out/tts_new.log 2>&1
echo "=== queue done $(date)" >> tools/vo/out/tts_new.log
