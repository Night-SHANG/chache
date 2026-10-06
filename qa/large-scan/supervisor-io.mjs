/** Bounded-memory, durable local I/O for the scan supervisor. */
import {
  closeSync, fsyncSync, lstatSync, openSync, readSync, readdirSync, renameSync, writeSync,
} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {dirname, join} from 'node:path';

export function fileDigest(path) {
  const fd = openSync(path, 'r'), buffer = Buffer.allocUnsafe(65536), digest = createHash('sha256');
  let bytes = 0, count;
  try { while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) { digest.update(buffer.subarray(0, count)); bytes += count; } }
  finally { closeSync(fd); }
  return {sha256: digest.digest('hex'), bytes};
}

export function* jsonLines(path, maxLineBytes = 16 * 1024 * 1024) {
  const fd = openSync(path, 'r'), buffer = Buffer.allocUnsafe(65536);
  let pending = Buffer.alloc(0), count;
  try {
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      pending = Buffer.concat([pending, buffer.subarray(0, count)]);
      let newline;
      while ((newline = pending.indexOf(10)) >= 0) {
        if (newline > maxLineBytes) throw new Error(`JSONL row exceeds ${maxLineBytes} bytes: ${path}`);
        const line = pending.subarray(0, newline).toString('utf8'); pending = pending.subarray(newline + 1);
        yield JSON.parse(line);
      }
      if (pending.length > maxLineBytes) throw new Error(`JSONL row exceeds ${maxLineBytes} bytes: ${path}`);
    }
    if (pending.length) throw new Error(`JSONL is not newline-terminated: ${path}`);
  } finally { closeSync(fd); }
}

export function atomicJsonWithCommands(path, value, tracePath) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`, fd = openSync(temporary, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify(value, null, 2).replace(/\}\s*$/, ',\n"commands":['));
    let first = true;
    if (tracePath) {
      for (const event of jsonLines(tracePath, 1024 * 1024)) {
        if (event.type !== 'command') continue;
        writeSync(fd, `${first ? '' : ','}\n${JSON.stringify({commandIndex: event.commandIndex, command: event.command})}`);
        first = false;
      }
    }
    writeSync(fd, '\n]}\n'); fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(temporary, path);
  const directory = openSync(dirname(path), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

export function directoryBytes(path) {
  let total = 0;
  for (const name of readdirSync(path)) {
    const child = join(path, name), stat = lstatSync(child);
    if (stat.isSymbolicLink()) throw new Error(`Output may not contain symlinks: ${child}`);
    total += stat.isDirectory() ? directoryBytes(child) : stat.size;
  }
  return total;
}

/** Kernel lock survives no stale-file race; stdin EOF releases it after parent death.
 * util-linux flock and /bin/sh are required on the Linux supervision host.
 * The tiny shell is solely a lock holder, never a game worker.
 */
export async function acquireOutputLock(output, onLost) {
  const holder = spawn('flock', ['--exclusive', '--nonblock', '--no-fork', join(output, '.supervisor.lock'), '/bin/sh', '-c', 'printf "locked\\n"; read -r ignored'], {stdio: ['pipe', 'pipe', 'pipe']});
  let acquired = false, released = false, stderr = '';
  const closed = new Promise(resolve => holder.on('close', code => resolve(code)));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { holder.kill('SIGKILL'); reject(new Error('Timed out acquiring output lock')); }, 5000);
    holder.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4096); });
    holder.once('error', error => { clearTimeout(timer); reject(error); });
    holder.stdout.once('data', data => {
      if (data.toString() !== 'locked\n') return;
      clearTimeout(timer); acquired = true; resolve();
    });
    holder.once('close', code => {
      clearTimeout(timer);
      if (!acquired) {
        const error = new Error(`Output is already locked or flock is unavailable (exit ${code}). ${stderr}`);
        error.code = 'OUTPUT_LOCKED'; reject(error);
      } else if (!released) onLost(new Error('Output lock holder exited unexpectedly'));
    });
  });
  return async () => { released = true; holder.stdin.end(); await closed; };
}
