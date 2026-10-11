#!/usr/bin/env python3
"""Create fixed regression assets from actual killed SQLite writers, never synthetic journals.

The committed ZIP is the deterministic test input. Regeneration has SQLite's random
journal checksums, so archive hashes are intentionally recorded afresh rather than
claiming byte-identical generation across SQLite versions.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'android/app/src/androidTest/assets/storage'
SCHEMA = 'CREATE TABLE kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)'
WRITER = r'''
import sqlite3,sys,time
c=sqlite3.connect(sys.argv[1],isolation_level=None)
c.execute('PRAGMA journal_mode=DELETE')
c.execute('PRAGMA synchronous=EXTRA')
c.execute('PRAGMA cache_size=5')
c.execute('BEGIN EXCLUSIVE')
c.execute('UPDATE kv SET value=? WHERE key=?',('中'*(1024*1024),'warehouse.a'))
print('UNCOMMITTED',flush=True)
time.sleep(60)
'''

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare(directory, kind):
    file = directory / 'warehouse-v1.db'
    c=sqlite3.connect(file)
    c.execute('PRAGMA journal_mode=DELETE')
    c.execute('PRAGMA synchronous=EXTRA')
    c.execute(SCHEMA)
    c.execute('PRAGMA user_version=' + ('99' if kind == 'future' else '1'))
    c.execute('INSERT INTO kv VALUES(?,?)',('warehouse.a','old'))
    c.execute('INSERT INTO kv VALUES(?,?)',('warehouse.z','z'*(512*1024)))
    c.commit()
    # An untouched committed overflow page can be damaged after the writer dies.
    overflow=c.execute("SELECT pageno FROM dbstat WHERE name='kv' AND pagetype='overflow' ORDER BY pageno LIMIT 1").fetchone()[0]
    page_size=c.execute('PRAGMA page_size').fetchone()[0]
    c.close()
    process=subprocess.Popen([sys.executable,'-u','-c',WRITER,str(file)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        assert process.stdout.readline().strip() == 'UNCOMMITTED'
        os.kill(process.pid,signal.SIGKILL)
        assert process.wait(timeout=10) == -signal.SIGKILL
    finally:
        if process.poll() is None:
            process.kill();process.wait(timeout=10)
    journal=Path(str(file)+'-journal')
    assert journal.is_file() and journal.stat().st_size > 512
    if kind == 'corrupt':
        with file.open('r+b') as stream:
            stream.seek((overflow-1)*page_size)
            stream.write(b'\xff\xff\xff\xff')  # Impossible next-overflow page, outside the pending update.
    before=(digest(file),digest(journal))
    for _ in range(2):
        ro=sqlite3.connect(file.as_uri()+'?mode=ro',uri=True)
        try:
            ro.execute('PRAGMA user_version').fetchone()
            raise AssertionError('Fixture is not a genuine hot rollback journal')
        except sqlite3.OperationalError as error:
            assert error.sqlite_errorcode == sqlite3.SQLITE_READONLY_ROLLBACK, (kind,error)
        finally: ro.close()
    assert before == (digest(file),digest(journal))
    snapshot=directory/'probe';snapshot.mkdir()
    shutil.copyfile(file,snapshot/file.name);shutil.copyfile(journal,snapshot/journal.name)
    recovered=sqlite3.connect(snapshot/file.name)
    try:
        if kind=='corrupt':
            try:
                check=recovered.execute('PRAGMA quick_check(1)').fetchone()[0]
                assert check != 'ok'
            except sqlite3.DatabaseError:
                pass
        else:
            assert recovered.execute('PRAGMA quick_check(1)').fetchone()[0]=='ok'
            assert recovered.execute('SELECT value FROM kv WHERE key=?',('warehouse.a',)).fetchone()[0]=='old'
            assert recovered.execute('PRAGMA user_version').fetchone()[0] == (99 if kind=='future' else 1)
    finally: recovered.close()
    assert before == (digest(file),digest(journal))
    return file,journal

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    manifest={'sqliteVersion':sqlite3.sqlite_version,'source':'actual child SIGKILL after uncommitted spilled DELETE/EXTRA transaction','fixtures':{}}
    with tempfile.TemporaryDirectory(prefix='warehouse-killed-writer-') as temp:
        for kind in ['valid','future','corrupt']:
            directory=Path(temp)/kind;directory.mkdir()
            files=prepare(directory,kind)
            archive=DEST/(kind+'-hot-journal.zip')
            with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as output:
                for file in files:
                    info=zipfile.ZipInfo(file.name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                    output.writestr(info,file.read_bytes())
            manifest['fixtures'][kind]={'archiveSha256':digest(archive),'files':{file.name:{'bytes':file.stat().st_size,'sha256':digest(file)} for file in files}}
    (DEST/'hot-journal-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__': main()
