# v118 evidence index

Authoritative final suite: logs/full-suite-final.txt, 3255 total / 3253 pass / 2 historical source-art failures, actual EXIT=1. Final lint/typecheck logs are *-final.txt.

Earlier full-suite files record the actual red or intermediate outcomes; they are not substituted for the final result. The first in-progress suite was terminated by a tool execution cancellation and has no terminal outcome; this was not a user cancellation. Later prior suites include obsolete assertions found and corrected; targeted green logs and the final whole suite are retained.

Cold-art RED/GREEN and old clock-hook RED/GREEN prove reproduction before implementation. Native Canvas per-platform production evidence is in the verification archive. Chromium's receipt explicitly records blocked launch and all scenarios NOT RUN.

The first preliminary production-host attempt ran alongside a full-suite build test which replaced browser/WeChat with dev output; it correctly failed version binding on those two targets and is not final acceptance. A frozen final rebuild and production-host run replace that preliminary output for delivery.
