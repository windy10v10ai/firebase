"""对比部署前后两段请求日志：各窗口状态码分布、按接口的 4xx/5xx 与延迟分位数，并标出疑似回归。

用法：python3 -I compare_windows.py <before.csv> <after.csv>
CSV 由 SKILL.md 里的 gcloud 命令导出，列为 timestamp,method,url,latency,status,revision。
"""
import csv
import re
import sys
from collections import defaultdict

# 样本太少时分位数抖得厉害，不参与回归判定
MIN_SAMPLES = 50
P95_RATIO = 1.5
P95_FLOOR_SECONDS = 0.05
RATE_RATIO = 2.0


def route_of(method, url):
    path = re.sub(r'^https?://[^/]+', '', url).split('?')[0]
    path = re.sub(r'/\d{5,}', '/:id', path)
    path = re.sub(r'/rooms/[A-Z0-9]{4,}', '/rooms/:code', path)
    return f'{method} {path}'


def load(path):
    latency = defaultdict(list)
    codes = defaultdict(lambda: defaultdict(int))
    stamps = []
    for row in csv.reader(open(path)):
        if len(row) < 6 or not row[3] or not row[4]:
            continue
        stamps.append(row[0])
        route = route_of(row[1], row[2])
        latency[route].append(float(row[3].rstrip('s')))
        codes[route][row[4]] += 1
    return latency, codes, stamps


def quantile(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * q))]


def error_counts(codes):
    out = defaultdict(int)
    for route, by_code in codes.items():
        for code, n in by_code.items():
            if code[0] in '45':
                out[f'{code} {route}'] += n
    return out


def main(before_path, after_path):
    b_lat, b_codes, b_ts = load(before_path)
    a_lat, a_codes, a_ts = load(after_path)
    b_total, a_total = len(b_ts), len(a_ts)
    if not b_total or not a_total:
        sys.exit('有一边没有数据，检查导出的时间范围')
    print(f'before: {b_total} 条 {min(b_ts)} -> {max(b_ts)}')
    print(f'after:  {a_total} 条 {min(a_ts)} -> {max(a_ts)}')

    for name, codes, total in (('before', b_codes, b_total), ('after', a_codes, a_total)):
        classes = defaultdict(int)
        for by_code in codes.values():
            for code, n in by_code.items():
                classes[code[0] + 'xx'] += n
        summary = ' '.join(f'{k}={v}({v / total:.2%})' for k, v in sorted(classes.items()))
        print(f'{name} 状态码: {summary}')

    all_b = [x for v in b_lat.values() for x in v]
    all_a = [x for v in a_lat.values() for x in v]
    print(f'整体 p50 {quantile(all_b, .5):.3f}/{quantile(all_a, .5):.3f}s  '
          f'p95 {quantile(all_b, .95):.3f}/{quantile(all_a, .95):.3f}s')

    print('\n== 4xx/5xx（按部署后次数排序，比例已按总请求量归一）')
    b_err, a_err = error_counts(b_codes), error_counts(a_codes)
    flags = []
    for key in sorted(set(b_err) | set(a_err), key=lambda k: -a_err.get(k, 0)):
        nb, na = b_err.get(key, 0), a_err.get(key, 0)
        rb, ra = nb / b_total, na / a_total
        mark = ''
        if key.startswith('5') and na > 0 and nb == 0:
            mark = '  <- 新出现的 5xx'
        elif na >= 10 and (nb == 0 or ra > rb * RATE_RATIO):
            mark = '  <- 比例上升'
        if mark:
            flags.append(key + mark)
        if na or nb:
            print(f'{nb:6d} {na:6d}  {key}{mark}')

    print('\n== 延迟与请求量（部署后请求量前 20 的接口）')
    print(f'{"route":58s} {"nB":>6s} {"nA":>6s} {"p50B":>7s} {"p50A":>7s} {"p95B":>7s} {"p95A":>7s}')
    for route in sorted(a_lat, key=lambda r: -len(a_lat[r]))[:20]:
        vb, va = b_lat.get(route, []), a_lat[route]
        if not vb:
            print(f'{route[:58]:58s} {0:6d} {len(va):6d}  （部署前没有）')
            continue
        p95b, p95a = quantile(vb, .95), quantile(va, .95)
        mark = ''
        if min(len(vb), len(va)) >= MIN_SAMPLES and p95a > p95b * P95_RATIO and p95a - p95b > P95_FLOOR_SECONDS:
            mark = '  <- p95 上升'
        share_b, share_a = len(vb) / b_total, len(va) / a_total
        if min(len(vb), len(va)) >= MIN_SAMPLES and (share_a > share_b * RATE_RATIO or share_b > share_a * RATE_RATIO):
            mark += '  <- 请求量占比变化'
        if mark:
            flags.append(route + mark)
        print(f'{route[:58]:58s} {len(vb):6d} {len(va):6d} {quantile(vb, .5):7.3f} {quantile(va, .5):7.3f} '
              f'{p95b:7.3f} {p95a:7.3f}{mark}')
    for route in sorted(set(b_lat) - set(a_lat), key=lambda r: -len(b_lat[r])):
        if len(b_lat[route]) >= MIN_SAMPLES:
            flags.append(f'{route}  <- 部署后没有请求（部署前 {len(b_lat[route])} 条）')

    print('\n== 待核实')
    print('\n'.join(flags) if flags else '无')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
