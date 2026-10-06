# 双模式对比版实施计划

依据：color-exit-mode-spec.md；用户接受逐箱装卸、原订单保留、最终主模式待试玩决定。执行方式：共享工作树分文件分工，规则、持久化、表现独立开发，主集成者拥有会话/菜单。

## 0. 旧模式修复验收基线

v0.3.2：462项Node、22项报告测试、lint/typecheck/preflight/build、原4个实际game.js宿主脚本及新增7路线71帧+三尺寸全部通过。game.js SHA da99edcb5113d13a6c57cead2b18891bee18055f4a7b92b5e06cc821de56aeb4；source SHA 2847b6594915017404f62437141cf709526b63fc9096175a210d062603969b27。新模式前提交此验收记录，保留研究和用户实测证据。

## 1. 规则与版本路由（TDD）

新增 src/domain/v4/content.ts、board.ts、engine.ts；修改根types/engine/board/replay路由，不改v1/v2/v3实现。CURRENT_RULESET保持3；增加COLOR_EXIT_RULESET=4。

状态mode=color_exit，runConfigId=run.color_exit_p0_v4。orders字段保存三份固定出口目标，供共同展示结构消费，但不刷新/随机。phase只input/result；无升级/特殊/每日/加班。目标30批，每6批一档，minBatch4，score每格10，3候选。生成使用既有Shape池与明确固定配置，三货类只食品/机械/化工。

Shipment新增可选transport:'conveyor'与cargoPaths:{cell:number,path:Point[]}[]。path仍指叉车南入口空路；cargoPaths只含该连通组内4邻接格，末格严格为对应出口。每出口一次，顺序N/E/W，按清路重新判定。Root orderStatus对v4给未接出口原因，不让v2算法误判。

测试：三门/对角/错门/不足/堵入口/无路/合法clear/清路chain/大组/同图预览等价/拒绝upgrades/生成仅3色/30批胜利/无位失败/输入不可变/seed与Replay/v1–v3黄金序列。

## 2. 存档与成绩隔离（TDD）

save.ts支持schema4且严格匹配v4 mode/config/静态目标/无升级特殊，旧schema含义不变。增加可选RunSlot参数，默认orders保持旧key；color_exit另main/backup/temp与归档前缀。每次load/save必须校验槽与mode，不能把损坏或放错槽的档当作另一模式；坏原文保护与读回失败策略沿用。

Profile保留settings/cosmetics共享；新增可选colorExit命名空间，包含独立stats/bestScores/lastRecordedRun。v4结算只更新此空间，不计订单成就、daily或旧stats。旧Profile缺字段按空色出口记录处理。nextRunSerial全局唯一；同模式重复结果幂等，交错两个模式的终局不会因另一个serial更新而漏记。重置Profile在同一记录里清两套统计，两个run槽保留；resetCursor同时防止旧终局复活，必须测试交错slot。

## 3. 运输与信息表现（TDD）

新增纯color-exit-motion模块及renderer分支。共享原叉车几何从南门进入/转向货物；启动阶段后，按cargoPaths逐箱流向对应门，叉车空载按原路退出南入口。禁止把整组作为刚体/货物直线穿无关格。简化模式静态路径+组描边+件数，不旋转/粒子；中断只丢表现。

新模式固定出口图标、南入口不同标记；顶栏“固定出口/每批至少4件/出货x/30”，不能沿用随机订单、升级、班次达成文案。预览货线与叉车空路用不同线型/颜色并给图例。状态原因：缺件、未接同色出口、南入口堵、叉车无路、预计出货。

## 4. 会话与菜单集成（主集成，TDD）

新增明确GameVariant = orders | color_exit应用概念，不改变旧run.mode日常/教学语义。菜单独立两模式入口；可继续各自存档，当前模式再开一局与订单每日另列。switchMode先确认，cancel无写盘/无命令；confirm先保存当前稳定局，失败停留不丢；加载目标独立槽，有坏档进入该槽恢复流程而非覆盖旧模式。退出/切后台/设置不改变模式成绩或重算出货。

首次颜色出口说明卡是UI状态，明确入口/三出口/数量和空路；不消耗RNG，不改变commands。加载旧订单仍进入原教学/恢复流程。结果和暂停按mode分支，color_exit没有加班/每日按钮。

## 5. 集成验证、有限对比与交付

完整lint/typecheck/all tests/preflight/build及旧4脚本/运输脚本再跑。新增真实game.js双模式host：菜单确认取消、双槽往返/新局/坏档/写失败、3出口、货线树、南入口、同源多帧、三尺寸、音频/后台/reduced、结果不混排。独立审查实查state/canvas输出，不能只用实现helper自证。

小规模固定seed出口贴放bot与留路bot只记录经验指标，计时/数量/策略/采样范围明确，不自动改参，不把机器数据叫好玩认证。二者规则序列不同，不伪称同seed就是完全相同货物供应。

更新版本、来源manifest/检查点与使用说明。本地commit和私有Library同identity ZIP checkpoint，内容明确双模式开发版；无Sites/外部仓库/微信上传或凭据。真实浏览器/微信及真人玩法比较仍待验。
