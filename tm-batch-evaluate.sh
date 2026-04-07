#!/bin/bash
# tm-batch-evaluate.sh - Запуск автоматической оценки карт TM
for batch in cards_batch_*.json; do
  echo "Обработка $batch..."
  claude -p "Оцени все карты в $batch используя десктопные тир-листы как эталон. Сохрани результаты в results_$(basename $batch). Используй правила оценки из .claude/skills/tm-evaluate/SKILL.md" \
    --allowedTools "Read,Write,Bash,Task" \
    --max-turns 50 \
    2>&1 | tee "logs/$(basename $batch .json).log"
  echo "Пакет $batch завершён, пауза 60 сек для лимитов..."
  sleep 60
done
claude -p "Объедини все файлы results_*.json, перегенерируй HTML тир-листы, git commit и push" \
  --allowedTools "Read,Write,Bash,Edit"
