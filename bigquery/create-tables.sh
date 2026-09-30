#!/bin/bash
# 用法：bash bigquery/create-tables.sh <game_data | game_data_dev>
# 只建不存在的数据集与表，重复执行不影响已有数据
set -euo pipefail

PROJECT_ID=windy10v10ai
LOCATION=asia-northeast1
DATASET=${1:?需要数据集名：game_data 或 game_data_dev}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

case "$DATASET" in
  game_data) DATASET_OPTIONS="location = '${LOCATION}'" ;;
  # 开发数据只用来核对本地写入的形状，不需要长期保留
  game_data_dev) DATASET_OPTIONS="location = '${LOCATION}', default_partition_expiration_days = 30" ;;
  *) echo "未知数据集：$DATASET" >&2; exit 1 ;;
esac

run_sql() {
  bq query --project_id="$PROJECT_ID" --location="$LOCATION" --use_legacy_sql=false --quiet "$1"
}

run_sql "CREATE SCHEMA IF NOT EXISTS \`${PROJECT_ID}.${DATASET}\` OPTIONS (${DATASET_OPTIONS})"

for sql_file in "$SCRIPT_DIR"/tables/*.sql; do
  echo "建表：$(basename "$sql_file" .sql)"
  run_sql "$(sed -e "s/\${PROJECT_ID}/${PROJECT_ID}/g" -e "s/\${DATASET}/${DATASET}/g" "$sql_file")"
done
