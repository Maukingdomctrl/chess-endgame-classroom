#!/usr/bin/env python3
"""Run a command; report wall time, CPU time and peak memory, so a benchmark row is a measurement, not a guess.

    python3 measure.py [--label NAME] [--log FILE.jsonl] -- <command> [args...]

    python3 measure.py --label 'KRPKR build, 4 threads, no cache' --log bench.jsonl -- node tools/course-kit/egtb/bench.cjs KRPKR

Prints one line to stderr (and appends a JSON record to --log): wall seconds, user+sys CPU seconds, CPU/wall
(about 1 = one core busy, 4 = four), peak resident memory in MB, exit code, and the machine (cores, RAM).

Peak memory is ru_maxrss of RUSAGE_CHILDREN: the largest resident set of any process the command started
(Linux). Worker threads live in their process, so a multi-threaded Node build is counted in full; separate
processes are not summed (an `npm run` wrapper does not hide the node process: the largest one is reported).
The exit code is the command's, so it can stand in for the command in scripts.
"""
import json
import os
import resource
import subprocess
import sys
import time


def machine():
    mem = 0
    try:
        with open('/proc/meminfo') as f:
            for line in f:
                if line.startswith('MemTotal:'):
                    mem = int(line.split()[1]) // 1024
    except OSError:
        pass
    return {'cores': os.cpu_count(), 'ram_mb': mem}


def main(argv):
    label, log = None, None
    if '--' not in argv:
        sys.exit(__doc__)
    opts, cmd = argv[:argv.index('--')], argv[argv.index('--') + 1:]
    while opts:
        k = opts.pop(0)
        if k == '--label':
            label = opts.pop(0)
        elif k == '--log':
            log = opts.pop(0)
        else:
            sys.exit(f'unknown option {k}\n{__doc__}')
    if not cmd:
        sys.exit(__doc__)
    t0 = time.time()
    code = subprocess.call(cmd)
    wall = time.time() - t0
    r = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = r.ru_utime + r.ru_stime
    rec = {
        'label': label or ' '.join(cmd), 'cmd': cmd, 'exit': code,
        'wall_s': round(wall, 1), 'cpu_s': round(cpu, 1), 'cpu_per_wall': round(cpu / wall, 2) if wall else None,
        'peak_mb': round(r.ru_maxrss / 1024), 'when': time.strftime('%Y-%m-%d %H:%M:%S'),
        'env': {k: v for k, v in os.environ.items() if k.startswith(('EGTB_', 'KIT_'))}, **machine(),
    }
    print(f"[measure] {rec['label']}: {rec['wall_s']} s wall, {rec['cpu_s']} s CPU (x{rec['cpu_per_wall']}), "
          f"peak {rec['peak_mb']} MB, exit {code} ({rec['cores']} cores, {rec['ram_mb']} MB RAM)", file=sys.stderr)
    if log:
        with open(log, 'a') as f:
            f.write(json.dumps(rec) + '\n')
    return code


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
