// Type-only contract: importing the API submodule avoids the package's global tt/console/timer declarations.
import type * as OfficialApi from '../../douyin-tools/node_modules/@douyin-minigame/api-typings/types/api/index';
import type {DouyinHost} from './douyin.ts';

/** Fails compilation if the published official API no longer satisfies this adapter's host boundary. */
type Assert<T extends true>=T;
export type DouyinOfficialHostContract=Assert<typeof OfficialApi extends DouyinHost?true:false>;
