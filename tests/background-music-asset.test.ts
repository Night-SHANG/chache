import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('the approved complete CC0 soundtrack is bundled locally with its exact identity and license',()=>{
 const file='assets/audio/bgm.mp3';assert.ok(existsSync(file),'Approved local background music is present');
 const bytes=readFileSync(file),metadata=JSON.parse(readFileSync('assets/audio/music-source.json','utf8'));
 assert.equal(bytes.length,1563002);assert.equal(createHash('sha256').update(bytes).digest('hex'),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
 assert.equal(metadata.id,'cozy-puzzle-1');assert.equal(metadata.license,'CC0 1.0 Universal');assert.equal(metadata.attribution_required,false);assert.equal(metadata.creator,'MintoDog');
 assert.match(readFileSync('assets/audio/NOTICE.txt','utf8'),/Cozy Puzzle In-Game 1/);assert.match(readFileSync('assets/audio/CC0-1.0.txt','utf8'),/CC0 1.0 Universal/);
});
