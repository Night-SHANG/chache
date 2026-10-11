export {};

declare const __APP_VERSION__:string;
declare const __DEV_DIAGNOSTICS__:boolean;
declare const __PLAYTEST_FREE_SHOP__:boolean;

// Task 1 is an isolated staging entry, deliberately fail-closed. The native storage,
// viewport and lifecycle adapters must replace this gate before any APK delivery.
const status=document.querySelector<HTMLElement>('#startup-status');
if(!status)throw Error('Missing Android startup status');
if(__DEV_DIAGNOSTICS__||__PLAYTEST_FREE_SHOP__)throw Error('Android acceptance requires paid production content');
status.textContent=`货箱最后一格 ${__APP_VERSION__}\nAndroid 原生适配尚未完成，暂不能开始游戏。`;
