import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const res='android/app/src/main/res';
const avatarSha256='832a7e11946c78b889b72b4c3c0f6def7fc1ae0b841c80ff0b5a67205acc6cb3';
const text=(path:string)=>readFile(path,'utf8');

test('Android launcher reuses the previously delivered game avatar byte for byte',async()=>{
 const manifest=await text('android/app/src/main/AndroidManifest.xml');
 assert.match(manifest,/android:icon="@mipmap\/warehouse_launcher"/);
 assert.match(manifest,/android:roundIcon="@mipmap\/warehouse_launcher"/);
 const png=await readFile(join(res,'mipmap-xxhdpi/warehouse_launcher.png'));
 assert.equal(createHash('sha256').update(png).digest('hex'),avatarSha256,'The delivered avatar must not be repainted, cropped or re-encoded');
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(png.readUInt32BE(16),144);
 assert.equal(png.readUInt32BE(20),144);
});

test('Android launch theme shows the game icon on the existing game background',async()=>{
 const styles=await text(join(res,'values/styles.xml'));
 const launch=styles.match(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/)?.[0]??'';
 assert.match(launch,/parent="Theme\.SplashScreen"/);
 assert.match(launch,/<item name="windowSplashScreenAnimatedIcon">@mipmap\/warehouse_launcher<\/item>/);
 assert.match(launch,/<item name="windowSplashScreenBackground">@color\/warehouse_launch_background<\/item>/);
 assert.match(launch,/<item name="postSplashScreenTheme">@style\/AppTheme\.NoActionBar<\/item>/);
 assert.match(await text(join(res,'values/colors.xml')),/<color name="warehouse_launch_background">#0c131c<\/color>/);
 assert.match(await text('scripts/build-android.mjs'),/background:#0c131c/);
 assert.doesNotMatch(styles,/@drawable\/splash|ic_launcher/);
});

test('Android app resources contain no template launcher or splash artwork',async()=>{
 async function files(path:string):Promise<string[]>{
  const entries=await readdir(path,{withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]))).flat();
 }
 const paths=await files(res);
 assert.deepEqual(paths.filter(path=>/\/(?:ic_launcher[^/]*|splash\.png)$/.test(path)),[],'Template artwork must not survive as unused packaged resources');
 assert.deepEqual(paths.filter(path=>path.endsWith('.png')),[join(res,'mipmap-xxhdpi/warehouse_launcher.png')],'Only the verified game avatar may remain as app-owned bitmap artwork');
 for(const path of paths.filter(path=>path.endsWith('.xml')))assert.doesNotMatch(await text(path),/@(?:drawable|mipmap|color)\/ic_launcher|@drawable\/splash/,path);
});

test('Android branding provenance records the delivered source without private account identifiers',async()=>{
 const provenance=await text('docs/android/BRANDING.md');
 for(const value of ['小游戏头像-144x144.png','2026-10-10','144×144','41,443',avatarSha256,'mipmap-xxhdpi/warehouse_launcher.png'])assert.ok(provenance.includes(value),value);
 assert.doesNotMatch(provenance,/libfile_|file_[a-f0-9]{16}|Sentinel_|CalpicoFile_/);
});
