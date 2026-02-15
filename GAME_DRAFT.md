# 猜词截码战 - 项目交接草稿（v4）

## 1. 目标与范围
- 目标：实现多人在线猜词截码战，规则为“按顺序描述三词、组内猜顺序、他组截获、统一积分、先到 2 分获胜（支持并列）”。
- 范围：`apps/server`（Express + Socket.io）与 `apps/web`（Next.js App Router）。

## 2. 已确认规则（当前实现）
- 每组 2 人，每组 4 个词（编号 1/2/3/4）。
- 每轮每个队伍会同时产生一个编码（3 位不重复编号）并指定 1 名 speaker 发言。
- speaker 按顺序给出 3 条线索（全体可见）。
- 本队仅“非 speaker 队友”可提交本队内猜；speaker 不参与本队内猜。
- 所有玩家都需要对“其他每个队伍”提交截获猜测。
- 计分：
  - 截获正确：对应猜中队伍 +1（同队多人命中同一目标队仅加 1 分）。
  - 目标队内猜错误：其他所有队伍各 +1。
- 胜负：任意队伍 `score >= 2` 即触发结束；同轮多队达标则并列胜利（`winnerTeamIds`）。
- speaker 轮换：按队内座位轮转（round 1 由 seat 0 发言，round 2 由 seat 1 发言，以此交替）。

## 3. 当前实现状态（已落地）
- 游戏核心
  - 状态模型已从单 `currentAttempt` 重构为每轮多 `currentAttempts`（每队一个 attempt）。
  - 阶段改为“全队同步发言 -> 全队同步猜测 -> 统一结算 -> 下一轮”。
  - 胜负判定使用 `winnerTeamIds`，支持并列。
  - 历史 attempt 保留 `scoreDeltas`（服务端），用于结算回放。
  - 对局中新增断线状态 `disconnectState`（断线玩家列表 + 截止时间）；新增结束原因 `finishedReason`（`NORMAL`/`DISCONNECT_TIMEOUT`/`HOST_FORCED`）。
  - 词条改为仅中文：`SecretWordSlot` 仅保留 `{ index, zh }`，不再使用英文字段。
  - 词库改为后端文件加载：服务端从 `apps/server/src/data/thuocl_words_max4.txt` 读取，不再硬编码在 `word-bank.ts`。
  - 每队 4 词抽取改为“从大词库按 seed 抽 4 个不重复词”，支持可复现。
- 房间能力
  - 创建房间后命名为 `XXX的房间`。
  - 大厅支持 `room:list` 与 `rooms:update` 的可加入房间列表。
  - 房主可解散房间（`room:disband`）。
  - 房主可在 `IN_GAME` 强制结束对局（`game:force-finish`）。
  - 成员可在 `LOBBY` 和 `FINISHED` 退出房间（`room:leave`）；`IN_GAME` 禁止退出。
- 前端展示
  - 未入房时：先设昵称，再显示“创建房间/可用房间”。
  - 入房后：顶部改为“你在某队 + 阶段任务 + 回合进度条（总进度/发言/内猜/截获）”。
  - 对局中出现断线时，全员看到断线通知与 30s 倒计时。
  - 对局中房主看到“强制结束对局”按钮。
  - 记录区改为“按队分组的简洁表”，仅显示 1/2/3/4 与线索历史行。
  - 前端不再在 `teams` 结构中持有词条，改为后端下发 `mySecretWords`（仅当前玩家所在队伍词条）。
  - 对局结束有独立“胜利/失败”界面，并根据 `finishedReason` 显示“正常结束/断线超时结束/房主强制结束”文案。

- 词库预处理（新增）
  - 新增目录 `wordslib/`，用于词库下载与预处理。
  - 下载脚本：`wordslib/download_sources.py`（来源：THUOCL + jieba）。
  - 预处理脚本：`wordslib/extract_thuocl_max4.py`，规则：
    - 仅保留词长 `<= 4`
    - 仅保留频次 `> 10000`
    - 跳过脏数据（频次非纯数字）
    - 输出为一行一个中文词（无数字）

## 4. 关键链路（交接必读）
- 创建房间
  - `room:create` -> 返回 `roomId/playerId`。
  - 服务端写入 `roomName: ${nickname}的房间`。
  - 广播 `rooms:update`。
- 同步回合流程
  1. `game:start` 后进入 `SPEAKING`，服务端生成所有队伍的 `currentAttempts`。
  2. 各队 speaker 分别 `speaker:submit`；全部提交（或超时补空线索）后进入 `GUESSING`。
  3. 玩家对每个目标队 `guess:submit`（本队目标仅 designated teammate 可内猜）。
  4. 全部 required guesses 收齐后统一结算，`score` 更新，写入历史并进入下一轮或 `FINISHED`。
- 词库生成与接入链路（新增）
  1. 运行 `python3.11 wordslib/download_sources.py` 下载原始词库到 `wordslib/data/raw/`。
  2. 运行 `python3.11 wordslib/extract_thuocl_max4.py` 产出 `wordslib/data/processed/thuocl_words_max4.txt`。
  3. 将产出复制到 `apps/server/src/data/thuocl_words_max4.txt`。
  4. 服务端启动时在 `apps/server/src/core/word-bank.ts` 读取该文件并用于抽词。
- 对局中断线处理（新增）
  1. 任意玩家断线后，服务端在 `IN_GAME` 下启动 30s 宽限计时并写入 `disconnectState`。
  2. 宽限期内重连成功（`room:reconnect`）则取消断线状态并继续对局。
  3. 宽限到期仍有玩家离线则自动结束：`status=FINISHED`，`finishedReason=DISCONNECT_TIMEOUT`，`winnerTeamIds=[]`。
- 房主强制结束（新增）
  - 房主在 `IN_GAME` 调用 `game:force-finish`，服务端立即结束：`status=FINISHED`，`finishedReason=HOST_FORCED`，`winnerTeamIds=[]`。
- 结束返回主界面
  - 前端“返回主界面”按钮：
    - Host -> `room:disband`（解散房间）
    - Member -> `room:leave`（退出房间）
  - 服务端发 `session:cleared`，前端清理 identity 并回到大厅。

## 5. 当前 Socket 事件
- Client -> Server
  - `room:list`
  - `room:create`
  - `room:join`
  - `room:reconnect`
  - `room:leave`
  - `room:disband`
  - `game:start`
  - `game:force-finish`
  - `speaker:submit`
  - `guess:submit`
  - `ai:action`
- Server -> Client
  - `rooms:update`
  - `state:update`
  - `session:cleared`

## 6. 代码结构定位
- 服务端
  - 事件入口：`apps/server/src/index.ts`
  - 业务核心：`apps/server/src/core/game-service.ts`
  - 词库加载：`apps/server/src/core/word-bank.ts`
  - 词库文件：`apps/server/src/data/thuocl_words_max4.txt`
  - 参数校验：`apps/server/src/core/schemas.ts`
  - 类型定义：`apps/server/src/types/game.ts`
- 前端
  - 页面：`apps/web/src/app/page.tsx`
  - socket 封装：`apps/web/src/hooks/useGameSocket.ts`
  - 视图类型：`apps/web/src/types/game.ts`
- 词库工具（新增）
  - 下载脚本：`wordslib/download_sources.py`
  - 清洗脚本：`wordslib/extract_thuocl_max4.py`
  - 工具目录忽略规则：`wordslib/.gitignore`

## 7. 现状注意事项 / 风险
- 当前截获提交流程按“玩家维度”收集：每名玩家都要对每个他队提交一次；结算时再折算到队伍加分（同队同目标只记 1 分）。
- `leaveRoom` 仅在 `LOBBY`/`FINISHED` 允许，`IN_GAME` 禁止；如果后续要支持中途退出，需要补托管/判负规则。
- 当前断线宽限为“房间级单计时器”：首次断线触发 30s 窗口；若窗口内新增断线，不会重置截止时间（沿用首个截止点）。
- 记录区 UI 已简化为纯线索表，不再展示轮次与加分详情；如需审计解释可考虑单独“裁判日志”视图。
- 词库中存在少量脏数据行（如频次含非数字字符），当前清洗脚本已跳过；若后续更换数据源，需复用同类校验。
- 词库文件目前通过手动复制进入 `apps/server/src/data/`；如后续频繁更新，建议加自动同步脚本或 npm script。

## 8. 完整游戏逻辑
2队伍4人情况:
A队, 人1,人2
B队, 人3,人4

回合开始
A队 人1  收到3个顺序, 给出"混淆词", 并公布
B队 人3  收到3个顺序, 给出"混淆词", 并公布

A队 人2  根据己方混淆词,猜测己方的顺序
B队 人4  根据己方混淆词,猜测己方的顺序


同时:
A队 人1, 人2 猜测B方的 顺序
B队 人3, 人4 猜测A方的 顺序

回合结束

下一轮开始: (注意人员的变化)
A队 人2  收到3个顺序, 给出"混淆词", 并公布
B队 人4  收到3个顺序, 给出"混淆词", 并公布

A队 人1  根据己方混淆词,猜测己方的顺序
B队 人3  根据己方混淆词,猜测己方的顺序


同时:
A队 人1, 人2 猜测B方的 顺序
B队 人3, 人4 猜测A方的 顺序
