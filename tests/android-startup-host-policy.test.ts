import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('Android DOM gate uses the runner-installed Chrome with its existing sandbox support',()=>{
 const workflow=readFileSync('.github/workflows/android-release.yml','utf8');
 const step=workflow.slice(workflow.indexOf('      - name: Verify silent Android bootstrap'),workflow.indexOf('      - name: Preserve Chromium startup'));
 assert.match(step,/export CHROMIUM_PATH=\/opt\/google\/chrome\/chrome/);
 assert.match(step,/test -x "\$CHROMIUM_PATH"/);
 assert.match(step,/playwright@1\.62\.1/);
 assert.doesNotMatch(step,/install --with-deps|PLAYWRIGHT_BROWSERS_PATH|--no-sandbox|sysctl|apparmor_parser|chmod|continue-on-error/);
 assert.match(step,/node scripts\/verify-android-startup-host\.mjs/);
 const script=readFileSync('scripts/verify-android-startup-host.mjs','utf8');
 assert.match(script,/chromiumSandbox:true/);
 assert.doesNotMatch(script,/chromiumSandbox:false|--no-sandbox/);
 assert.match(script,/receipt\.browserExecutable=browserExecutable/);
 assert.match(script,/receipt\.browserVersion=await browser\.version/);
});
