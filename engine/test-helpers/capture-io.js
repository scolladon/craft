// Shared in-process io double for bin-main(argv, io) unit tests.
export function makeCaptureIo() {
  const io = {
    stdout: { writes: [], write(s) { this.writes.push(s); } },
    stderr: { writes: [], write(s) { this.writes.push(s); } },
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');
  return io;
}
