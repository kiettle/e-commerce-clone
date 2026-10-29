#!/usr/bin/env python3
"""Local experiment wrapper; monitors the real k6 without changing its workload."""
import datetime, json, os, pathlib, resource, signal, subprocess, sys, time
real = '/opt/homebrew/bin/k6'
if len(sys.argv) < 2 or sys.argv[1] != 'run':
    os.execv(real, [real, *sys.argv[1:]])
out = pathlib.Path(os.environ['LOAD_ARTIFACT_DIR'])
out.mkdir(parents=True, exist_ok=True)
limit_mb = int(os.environ.get('LOAD_GENERATOR_RSS_LIMIT_MB', '6144'))
started = time.monotonic()
started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
def host_memory():
    result = {}
    for binary, args in [('/usr/bin/vm_stat', []), ('/usr/bin/memory_pressure', ['-Q'])]:
        try:
            result[pathlib.Path(binary).name] = subprocess.check_output([binary, *args], text=True, timeout=5)
        except Exception as error:
            result[pathlib.Path(binary).name] = str(error)
    return result
before = host_memory()
process = subprocess.Popen([real, *sys.argv[1:]])
samples = []
abort_reason = None
abort_at = None
while process.poll() is None:
    elapsed = time.monotonic() - started
    try:
        value = subprocess.check_output(['/bin/ps', '-p', str(process.pid), '-o', 'rss=,%cpu='], text=True, timeout=2).split()
        if len(value) == 2:
            rss_mb, cpu = int(value[0]) / 1024, float(value[1])
            samples.append({'elapsedSeconds': round(elapsed, 3), 'rssMiB': round(rss_mb, 2), 'cpuPercent': cpu})
            if rss_mb > limit_mb and abort_reason is None:
                abort_reason = f'Generator RSS exceeded {limit_mb} MiB; resource-limited run, not a capacity result.'
    except subprocess.SubprocessError:
        pass
    if elapsed > 240 and abort_reason is None:
        abort_reason = 'Generator exceeded the 240-second wall-clock guard.'
    if abort_reason is not None:
        if abort_at is None:
            abort_at = time.monotonic()
            process.send_signal(signal.SIGINT)
        elif time.monotonic() - abort_at > 10:
            process.kill()
    time.sleep(1)
code = process.wait()
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
report = {
    'startedAt': started_at, 'elapsedSeconds': round(time.monotonic() - started, 3),
    'rssLimitMiB': limit_mb, 'abortReason': abort_reason, 'exitCode': code,
    'peakChildRssMiB': usage.ru_maxrss / (1024 * 1024),
    'samples': samples, 'hostMemoryBefore': before, 'hostMemoryAfter': host_memory(),
    'notes': 'macOS ps RSS sampled once per second. CPU percent can reach 800 on this 8-core host. Peak child RSS includes short-lived monitoring commands. Host counters are cumulative; compare before/after. This does not isolate backend resource use.'
}
(out / 'generator-resources.json').write_text(json.dumps(report, indent=2) + '\n')
if abort_reason:
    print('[resource-guard] ' + abort_reason, file=sys.stderr)
print(f'[resource-monitor] peak child RSS={report["peakChildRssMiB"]:.1f} MiB; exit={code}', file=sys.stderr)
sys.exit(1 if abort_reason else (code if code >= 0 else 128 - code))
