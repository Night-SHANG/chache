#!/usr/bin/env python3
"""Real Java snapshot + real SQLite probe; not an Android SQLite runtime claim."""
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import subprocess
import sys
import tempfile
import zipfile

CLASSES=Path(sys.argv[1]);ASSETS=Path(sys.argv[2]);MAIN='io.github.nightshang.chache.storage.RecoverySnapshotProbe'
manifest=json.loads((ASSETS/'hot-journal-manifest.json').read_text())
def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()
def original_hashes(db): return (digest(db),digest(Path(str(db)+'-journal')))
def ro_blocked(db):
    for _ in range(2):
        c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True)
        try:
            c.execute('PRAGMA user_version').fetchone();raise AssertionError('Read-only unexpectedly recovered the journal')
        except sqlite3.OperationalError as error:
            assert error.sqlite_errorcode == sqlite3.SQLITE_READONLY_ROLLBACK, error
        finally:c.close()
with tempfile.TemporaryDirectory(prefix='warehouse-recovery-probe-') as temp:
    root=Path(temp)
    for kind in ['valid','future','corrupt']:
        archive=ASSETS/(kind+'-hot-journal.zip');assert digest(archive)==manifest['fixtures'][kind]['archiveSha256']
        directory=root/kind;directory.mkdir();cache=directory/'cache';cache.mkdir()
        with zipfile.ZipFile(archive) as zipped:
            assert set(zipped.namelist())=={'warehouse-v1.db','warehouse-v1.db-journal'}
            zipped.extractall(directory)
        for name,expected in manifest['fixtures'][kind]['files'].items():assert digest(directory/name)==expected['sha256']
        db=directory/'warehouse-v1.db';before=original_hashes(db);ro_blocked(db)
        # Repeat private validation to prove aborted/rejected inspection does not consume the original journal.
        for attempt in range(2):
            worker=subprocess.Popen(['java','-cp',str(CLASSES),MAIN,str(db),str(cache)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                snapshot=Path(worker.stdout.readline().strip());assert snapshot.is_file()
                assert snapshot.parent.parent==cache and snapshot.name=='warehouse-v1.db'
                copy=sqlite3.connect(snapshot)
                try:
                    version=copy.execute('PRAGMA user_version').fetchone()[0]
                    if kind=='corrupt':
                        try:assert copy.execute('PRAGMA quick_check(1)').fetchone()[0]!='ok'
                        except sqlite3.DatabaseError:pass
                    else:
                        assert copy.execute('PRAGMA quick_check(1)').fetchone()[0]=='ok'
                        assert copy.execute('SELECT value FROM kv WHERE key=?',('warehouse.a',)).fetchone()[0]=='old'
                        assert version==(99 if kind=='future' else 1)
                finally:copy.close()
                worker.stdin.write('\n');worker.stdin.flush()
                assert worker.wait(timeout=10)==0,worker.stderr.read()
            finally:
                if worker.poll() is None:worker.kill();worker.wait(timeout=10)
            assert not list(cache.iterdir()),'Private copy cleanup must finish before original writable open'
            assert original_hashes(db)==before
        blocked=directory/'not-a-directory';blocked.write_text('blocked')
        failed=subprocess.run(['java','-cp',str(CLASSES),MAIN,str(db),str(blocked),'expect-failure'],capture_output=True,text=True,timeout=10)
        assert failed.returncode==0 and 'STAGING_FAILED' in failed.stdout,failed.stderr
        assert original_hashes(db)==before
        # Known unsupported sidecars must never be generalized into this recovery path.
        wal=Path(str(db)+'-wal');wal.write_bytes(b'unsupported')
        failed=subprocess.run(['java','-cp',str(CLASSES),MAIN,str(db),str(cache),'expect-failure'],capture_output=True,text=True,timeout=10)
        assert failed.returncode==0 and 'STAGING_FAILED' in failed.stdout,failed.stderr
        assert original_hashes(db)==before;wal.unlink()
        journal=Path(str(db)+'-journal');original_journal=journal.read_bytes()
        name=b'../../must-not-follow-super-journal'
        journal.write_bytes(original_journal+name+struct.pack('>IIQ',len(name),sum(name),0xd9d505f920a163d7))
        with_attached=original_hashes(db)
        failed=subprocess.run(['java','-cp',str(CLASSES),MAIN,str(db),str(cache),'expect-failure'],capture_output=True,text=True,timeout=10)
        assert failed.returncode==0 and 'STAGING_FAILED' in failed.stdout,failed.stderr
        assert original_hashes(db)==with_attached
        journal.write_bytes(original_journal)
        assert not list(cache.iterdir())
        if kind=='valid':
            c=sqlite3.connect(db)
            assert c.execute('SELECT value FROM kv WHERE key=?',('warehouse.a',)).fetchone()[0]=='old';c.close()
            assert not Path(str(db)+'-journal').exists()
        else:ro_blocked(db);assert original_hashes(db)==before
print('real killed-writer fixtures: v1 recovery, future/corrupt preservation, repeated staging, staging failure, no WAL/attached paths and private cleanup passed')
