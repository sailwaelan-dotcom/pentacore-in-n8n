#!/bin/sh
# Lance un stage : agent scripte (mode demo) ou vrai agent Kilo. Remplace
# stage_runner.run_stage de Pentacore. n8n ne sait pas surveiller le silence :
# `timeout` borne la duree totale (ecart assume, cf. conception section 10).
#
# Sort toujours en 0 et imprime `__exit=<code>` en derniere ligne : c'est n8n
# qui lit le code et decide, pas une erreur de noeud opaque.
#
# Usage : lancer-agent.sh <stage> <tentative> <run_id> <comportement|vrai> <contexte>
stage=$1 tentative=$2 run_id=$3 comportement=$4 contexte=$5
cd /depot || { echo "__exit=1"; exit 0; }

if [ "$comportement" = "vrai" ]; then
  message=$(cat "$contexte.message.txt")
  timeout "${PENTACORE_DUREE_MAX_S:-2700}" kilo run --auto --agent pentacore-lead \
    --model "${PENTACORE_MODELE}" --dir /depot "$message" 2>&1
  code=$?
else
  sh /moteur/agent-scripte.sh "$comportement" "$stage" "$tentative" "$run_id" 2>&1
  code=$?
fi
echo "__exit=$code"
exit 0
