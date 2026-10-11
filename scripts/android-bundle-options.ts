import {resolve} from 'node:path';
import type {BuildOptions} from 'esbuild';

/** Production bundler policy also exercised by real public-package import tests. */
export function androidBundleOptions(projectRoot=process.cwd()):BuildOptions {
 return {
  nodePaths:[resolve(projectRoot,'android-shell/node_modules')],
  bundle:true,format:'iife',target:'es2018',minify:false,minifyWhitespace:true,
  sourcemap:false,legalComments:'eof',logLevel:'warning',
  define:{__DEV_DIAGNOSTICS__:'false',__PLAYTEST_FREE_SHOP__:'false',__APP_VERSION__:JSON.stringify('1.0.10')},
 };
}
