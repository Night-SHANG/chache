/** Real-browser smoke. Requires Playwright + its Chromium; serve itch-browser first. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out='artifacts/browser-i18n-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}});
const failures=[];
try {
 for(const device of [{name:'desktop',width:540,height:960},{name:'mobile',width:360,height:640},{name:'itch',width:405,height:720}]){
  const context=await browser.newContext({viewport:device,locale:'en-US'}),page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  await page.goto(process.env.WAREHOUSE_URL??'http://127.0.0.1:4173/');
  const language=page.locator('#warehouse-language');await language.waitFor();
  assert.equal(await language.inputValue(),'en');assert.equal(await page.title(),'Warehouse: Last Slot');
  await page.waitForTimeout(350);await page.screenshot({path:`${out}/${device.name}-en.png`});
  const snapshot=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='warehouse.browser.language.v1')));
  const canvas=page.locator('#game'),bounds=await canvas.boundingBox();assert.ok(bounds);
  await page.mouse.click(bounds.x+bounds.width*.5,bounds.y+bounds.height*(840/1920));await page.waitForTimeout(100);assert.equal(await language.isVisible(),false);
  await page.mouse.click(bounds.x+bounds.width*.5,bounds.y+bounds.height*(1637/1920));await language.waitFor({state:'visible'});
  const before=await snapshot();await language.selectOption('zh');assert.equal(await page.title(),'货箱：最后一格');assert.deepEqual(await snapshot(),before);
  await page.screenshot({path:`${out}/${device.name}-zh.png`});await page.reload();await language.waitFor();assert.equal(await language.inputValue(),'zh');
  await language.selectOption('en');await page.reload();await language.waitFor();assert.equal(await language.inputValue(),'en');
  await context.close();
 }
 const chinese=await browser.newContext({locale:'zh-CN'}),page=await chinese.newPage();await page.goto(process.env.WAREHOUSE_URL??'http://127.0.0.1:4173/');await page.locator('#warehouse-language').waitFor();assert.equal(await page.locator('#warehouse-language').inputValue(),'zh');await chinese.close();
 assert.deepEqual(failures,[]);await writeFile(`${out}/result.json`,JSON.stringify({passed:true,checks:['English first visit','Chinese first visit','manual switch','persistence reload','game storage unchanged','mobile and desktop','no page errors']},null,2));
}finally{await browser.close();}
