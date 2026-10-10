// 生成 Cloud Monitoring 看板「API 延迟」的配置，输出到 stdout，同步方式见 docs/api/README.md 的「延迟监控」。
// 看板里的 PromQL 与 SQL 都从下面三张映射表拼出来，同一张表在多个查询里各用一次，手改 JSON 容易漏改其中一处。

// 代发路由并入原路由统计，两边进的是同一段逻辑。结算的代发只报按玩家的 GA4 事件，耗时与直连差得多，单独成线
const PROXY_TO_ORIGINAL: [string, string][] = [
  ['GET proxy/game-end-local-post', 'POST game/end/local（代发）'],
  ['GET proxy/game-start', 'GET game/start'],
  ['GET proxy/game-probe', 'GET game/probe'],
  ['GET proxy/player-info', 'GET player info'],
  ['GET proxy/player-member-points-use-post', 'POST player/member-points/use'],
  ['GET proxy/player-setting-put', 'PUT player setting'],
  ['GET proxy/player-game-preset-put', 'PUT player game-preset'],
  ['GET proxy/player-conduct-post', 'POST player/conduct'],
  ['GET proxy/feedback-post', 'POST feedback'],
  ['GET proxy/daily-task', 'GET daily-task'],
  ['GET proxy/daily-task-refresh-post', 'POST daily-task/refresh'],
  ['GET proxy/alipay-order-create-post', 'POST alipay/order/create'],
  ['GET proxy/alipay-order-query', 'GET alipay/order/query'],
];

// 分段计时日志里的路由模板 → 步骤图上的柱名。开局的直连与代发步骤相同，合成一根
const TIMED_ROUTE_LABELS: [string, string][] = [
  ['GET /api/game/start', '开局'],
  ['GET /api/proxy/game-start', '开局'],
  ['POST /api/game/end/local', '本地结算（直连）'],
  ['GET /api/proxy/game-end-local-post', '本地结算（代发）'],
  ['POST /api/game/end', '结算（官方服务器）'],
];

const STEP_LABELS: [string, string][] = [
  ['upsertPlayers', '建档与更新开局时间'],
  ['eventReward', '活动奖励'],
  ['findMembers', '查会员'],
  ['memberDailyPoints', '会员每日积分'],
  ['ga4GameStart', '上报 GA4'],
  ['ga4GameEnd', '上报 GA4'],
  ['playerInfo', '读玩家信息'],
  ['dailyTasks', '每日任务'],
  ['recordGameEnd', '记录积分与战绩'],
  ['playerStats', '生涯统计'],
  ['other', '其他（鉴权、框架）'],
];

const METRIC = 'logging_googleapis_com:user_api_request_latency';
const SELECTOR = '{monitored_resource="cloud_run_revision"}';
const LOG_TABLE = '`windy10v10ai.global._Default._AllLogs`';

// 请求量用 15 分钟平均，分位数要更多样本才稳，用 30 分钟
const RPM_WINDOW = '15m';
const LATENCY_WINDOW = '30m';
// 画哪几条线按过去一天选，线条固定下来，不随每个时间点的排名忽隐忽现
const PICK_WINDOW = '1d';
const TOP_N = 8;
// 偶尔才调一次的接口样本太少，p95 没有参考价值，不参加延迟排名
const MIN_TRAFFIC_SHARE = 0.01;

function withApiLabel(expr: string): string {
  let result = `label_replace(label_join(${expr}, "api", " ", "method", "path", "subpath"), "api", "$1", "api", "(.*) ")`;
  for (const [proxy, original] of PROXY_TO_ORIGINAL) {
    result = `label_replace(${result}, "api", "${original}", "api", "${proxy}")`;
  }
  return result;
}

function requestRate(window: string): string {
  return `sum by (api) (${withApiLabel(`rate(${METRIC}_count${SELECTOR}[${window}])`)})`;
}

function latencyQuantile(quantile: number, window: string): string {
  return `histogram_quantile(${quantile}, sum by (le, api) (${withApiLabel(`rate(${METRIC}_bucket${SELECTOR}[${window}])`)}))`;
}

const slowestApis = `topk(${TOP_N}, ${latencyQuantile(0.95, PICK_WINDOW)} and on (api) (${requestRate(PICK_WINDOW)} >= scalar(sum(rate(${METRIC}_count${SELECTOR}[${PICK_WINDOW}]))) * ${MIN_TRAFFIC_SHARE}))`;

function sqlCase(expr: string, pairs: [string, string][], indent: string): string {
  const whens = pairs.map(([from, to]) => `${indent}  WHEN '${from}' THEN '${to}'`).join('\n');
  return `CASE ${expr}\n${whens}\n${indent}  ELSE ${expr} END`;
}

const stepSql = `WITH t AS (
  SELECT
    ${sqlCase('JSON_VALUE(json_payload.route)', TIMED_ROUTE_LABELS, '    ')} AS route,
    CAST(JSON_VALUE(json_payload.totalMs) AS FLOAT64) AS total,
    json_payload.steps AS steps
  FROM ${LOG_TABLE}
  WHERE JSON_VALUE(json_payload.message) = 'request timing'
),
n AS (SELECT route, COUNT(*) AS req, AVG(total) AS avg_total FROM t GROUP BY route),
s AS (
  SELECT route, JSON_VALUE(x.name) AS step, SUM(CAST(JSON_VALUE(x.ms) AS FLOAT64)) AS ms
  FROM t, UNNEST(JSON_QUERY_ARRAY(t.steps)) AS x
  GROUP BY route, step
),
c AS (
  SELECT s.route, s.step, s.ms / n.req AS avg_ms FROM s JOIN n USING (route)
  UNION ALL
  SELECT n.route, 'other', n.avg_total - SUM(s.ms) / n.req
  FROM n JOIN s USING (route) GROUP BY n.route, n.req, n.avg_total
)
SELECT
  route,
  ${sqlCase('step', STEP_LABELS, '  ')} AS step,
  ROUND(avg_ms, 1) AS avg_ms
FROM c`;

const summarySql = `WITH r AS (
  SELECT
    timestamp,
    CONCAT(http_request.request_method, ' ',
      IFNULL(REGEXP_EXTRACT(http_request.request_url, r'/api/((?:[a-z-]+/)*[a-z-]+)'), '?'),
      IFNULL(CONCAT(' ', REGEXP_EXTRACT(http_request.request_url, r'/api/[a-z/-]+/[0-9]+/([a-z/-]*[a-z-])')), '')) AS raw_api,
    IFNULL(http_request.latency.seconds, 0) * 1000 + IFNULL(http_request.latency.nanos, 0) / 1000000 AS ms,
    http_request.status AS status
  FROM ${LOG_TABLE}
  WHERE log_id = 'run.googleapis.com/requests'
    AND JSON_VALUE(resource.labels.service_name) = 'client'
),
a AS (
  SELECT *, ${sqlCase('raw_api', PROXY_TO_ORIGINAL, '    ')} AS api,
    GREATEST(TIMESTAMP_DIFF(MAX(timestamp) OVER (), MIN(timestamp) OVER (), SECOND), 60) / 60 AS minutes,
    COUNT(*) OVER () AS total,
    SUM(ms) OVER () AS total_ms
  FROM r
)
SELECT
  api AS \`接口\`,
  ROUND(100 * COUNTIF(status >= 400) / COUNT(*), 2) AS \`错误率%\`,
  COUNT(*) AS \`次数\`,
  ROUND(COUNT(*) / ANY_VALUE(minutes), 2) AS \`rpm\`,
  ROUND(100 * COUNT(*) / ANY_VALUE(total), 1) AS \`请求占比%\`,
  ROUND(100 * SUM(ms) / ANY_VALUE(total_ms), 1) AS \`耗时占比%\`,
  ROUND(APPROX_QUANTILES(ms, 100)[OFFSET(50)]) AS \`p50 ms\`,
  ROUND(APPROX_QUANTILES(ms, 100)[OFFSET(95)]) AS \`p95 ms\`,
  ROUND(APPROX_QUANTILES(ms, 100)[OFFSET(99)]) AS \`p99 ms\`,
  COUNTIF(status BETWEEN 400 AND 499) AS \`4xx\`,
  COUNTIF(status >= 500) AS \`5xx\`
FROM a
GROUP BY api
ORDER BY \`次数\` DESC`;

function lineChart(title: string, query: string, yLabel: string) {
  return {
    title,
    xyChart: {
      dataSets: [{ plotType: 'LINE', timeSeriesQuery: { prometheusQuery: query } }],
      yAxis: { label: yLabel, scale: 'LINEAR' },
    },
  };
}

// 更新已有看板要带上它当前的 etag，由调用方从 describe 取出后传入
const etag = process.argv[2];

const dashboard = {
  displayName: 'API 延迟',
  ...(etag ? { etag } : {}),
  mosaicLayout: {
    columns: 48,
    tiles: [
      {
        xPos: 0,
        yPos: 0,
        width: 48,
        height: 16,
        widget: lineChart(
          `调用最多的 ${TOP_N} 个接口（rpm，15 分钟平均）`,
          `${requestRate(RPM_WINDOW)} * 60 and on (api) topk(${TOP_N}, ${requestRate(PICK_WINDOW)})`,
          'rpm',
        ),
      },
      {
        xPos: 0,
        yPos: 16,
        width: 24,
        height: 16,
        widget: lineChart(
          `延迟最高的 ${TOP_N} 个接口 p50（30 分钟窗口）`,
          `${latencyQuantile(0.5, LATENCY_WINDOW)} and on (api) ${slowestApis}`,
          '秒',
        ),
      },
      {
        xPos: 24,
        yPos: 16,
        width: 24,
        height: 16,
        widget: lineChart(
          `延迟最高的 ${TOP_N} 个接口 p95（30 分钟窗口）`,
          `${latencyQuantile(0.95, LATENCY_WINDOW)} and on (api) ${slowestApis}`,
          '秒',
        ),
      },
      {
        xPos: 0,
        yPos: 32,
        width: 48,
        height: 16,
        widget: {
          title: '开局 / 结算各步骤平均耗时（毫秒，按看板时间范围）',
          xyChart: {
            chartOptions: { displayHorizontal: true },
            dataSets: [
              {
                plotType: 'STACKED_BAR',
                timeSeriesQuery: { opsAnalyticsQuery: { sql: stepSql } },
                dimensions: [
                  { column: 'route', columnType: 'STRING', sortOrder: 'SORT_ORDER_ASCENDING' },
                ],
                // 分组的聚合只支持 count
                breakdowns: [
                  {
                    column: 'step',
                    limit: 12,
                    aggregationFunction: { type: 'count' },
                    sortOrder: 'SORT_ORDER_DESCENDING',
                  },
                ],
                measures: [{ column: 'avg_ms', aggregationFunction: { type: 'sum' } }],
              },
            ],
          },
        },
      },
      {
        xPos: 0,
        yPos: 48,
        width: 48,
        height: 24,
        widget: {
          title: '各接口汇总（按看板时间范围，代发已并入原路由）',
          timeSeriesTable: {
            dataSets: [{ timeSeriesQuery: { opsAnalyticsQuery: { sql: summarySql } } }],
          },
        },
      },
    ],
  },
};

process.stdout.write(JSON.stringify(dashboard, null, 2));
