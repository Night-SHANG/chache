// Conservative decimal 20 MB bound for the current unsplit Douyin package.
export const DOUYIN_SINGLE_PACKAGE_LIMIT=20_000_000;
export function douyinPackageReport(files){
 if(!Array.isArray(files)||files.some(file=>!file||typeof file.path!=='string'||!Number.isSafeInteger(file.bytes)||file.bytes<0))throw Error('Invalid Douyin package inventory');
 const names=new Set();
 for(const file of files){if(names.has(file.path)||file.path.startsWith('/')||file.path.split('/').includes('..'))throw Error('Invalid Douyin package path');names.add(file.path);}
 const totalBytes=files.reduce((total,file)=>total+file.bytes,0);
 return {subpackages:false,totalBytes,fileCount:files.length,limitBytes:DOUYIN_SINGLE_PACKAGE_LIMIT,overLimit:totalBytes>DOUYIN_SINGLE_PACKAGE_LIMIT,ideProcessedSize:'NOT RUN',files};
}
