/** Raw directory accounting only. WeChat IDE processing is a separate, unrun acceptance step. */
export function wechatPackageReport(inventory){
 if(inventory.some(row=>row.path.startsWith('cosmetics/')))throw Error('Single-package build unexpectedly contains a cosmetics subpackage');
 const mainBytes=inventory.reduce((sum,row)=>sum+row.bytes,0),mainLimit=4*1024*1024;
 return {packaging:'single',mainBytes,subpackageBytes:{},totalBytes:mainBytes,limits:{mainBytes:mainLimit,totalBytes:30*1024*1024},rawMainPackageOverLimit:mainBytes>mainLimit,rawMainPackageOverLimitBytes:Math.max(0,mainBytes-mainLimit),processedIdeBytes:null,processedIdeStatus:'NOT RUN; raw directory bytes are not WeChat processed upload size',officialSnapshot:'https://github.com/VaJoy/wx-minigame-helper/blob/ad99e35a0200d4548cd879aa218ce845fd1e9fa2/skills/wx-minigame-helper/references/guide/base-ability/code-package.md',inventory};
}
