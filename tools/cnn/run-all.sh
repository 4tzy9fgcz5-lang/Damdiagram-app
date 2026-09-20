#!/bin/sh
# Draait alle 6 meetrondes parallel en daarna het rapport.
# Gebruik (vanuit de project-root): tools/cnn/run-all.sh labels.txt crops uitvoermap
set -e
LABELS="$1"; CROPS="$2"; OUT="$3"
mkdir -p "$OUT"
for fold in 0 1 2 3 4 5; do
  node --no-warnings tools/cnn/train.mjs cv "$LABELS" "$CROPS" "$OUT" $fold > "$OUT/log_cv_$fold.txt" 2>&1 &
done
wait
node --no-warnings tools/cnn/report.mjs "$OUT"
