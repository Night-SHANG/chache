#!/usr/bin/env python3
"""Exec one worker with a fail-closed Linux parent-death guard.

Only this process's PR_SET_PDEATHSIG is changed. No permissions, system
settings, unrelated processes, third-party packages, or network are used.
The expected supervisor PID closes the parent-died-before-prctl race.
"""
import ctypes
import os
import signal
import sys


def fail(message):
    print(f"WORKER_PARENT_GUARD: {message}", file=sys.stderr, flush=True)
    raise SystemExit(125)


def main():
    args = sys.argv[1:]
    if len(args) < 4 or args[0] != "--parent-pid" or args[2] != "--":
        fail("expected --parent-pid PID -- EXECUTABLE [ARG ...]")
    try:
        expected_parent = int(args[1])
    except ValueError:
        fail("expected parent PID must be an integer")
    if expected_parent <= 1 or sys.platform != "linux":
        fail("a real supervisor PID and Linux are required")
    command = args[3:]
    if not os.path.isabs(command[0]):
        fail("worker executable must be an absolute path")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        prctl = libc.prctl
        prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong,
                          ctypes.c_ulong, ctypes.c_ulong]
        prctl.restype = ctypes.c_int
        if prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
            error = ctypes.get_errno()
            fail(f"PR_SET_PDEATHSIG failed: errno={error} {os.strerror(error)}")
        configured_signal = ctypes.c_int(0)
        if prctl(2, ctypes.addressof(configured_signal), 0, 0, 0) != 0:  # PR_GET_PDEATHSIG
            error = ctypes.get_errno()
            fail(f"PR_GET_PDEATHSIG failed: errno={error} {os.strerror(error)}")
        if configured_signal.value != signal.SIGKILL:
            fail("kernel parent-death signal verification failed")
        if os.getppid() != expected_parent:
            fail(f"expected parent {expected_parent} changed or is gone; worker will not start")
        # The signal survives ordinary exec; Node keeps this PID and parent.
        os.execv(command[0], command)
    except (OSError, AttributeError) as error:
        fail(str(error))


if __name__ == "__main__":
    main()
