# 猜词截码战 - 项目交接草稿（v6）

## 1. 目标与范围
- 目标：实现多人在线猜词截码战，规则为“按顺序描述三词、组内猜顺序、他组截获、统一积分、先到 2 分获胜（支持并列）”。
- 范围：`apps/server`（Express + Socket.io）、`apps/web`（Next.js App Router）、`apps/word-service`（Python + Flask 词语相关度服务）。

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
  - `ai:action` 已接入独立词语服务：对编码对应的 3 个目标词分别查询近邻词（Top 10），每词随机抽 1 个作为线索。
  - AI 线索生成保留降级兜底：当词语服务不可用/超时时，回退为目标词前 2 个字，避免功能中断。
- 房间能力
  - 创建房间后命名为 `XXX的房间`。
  - 大厅支持 `room:list` 与 `rooms:update` 的可加入房间列表。
  - 房主可解散房间（`room:disband`）。
  - 房主可在 `IN_GAME` 强制结束对局（`game:force-finish`）。
  - 成员可在 `LOBBY` 和 `FINISHED` 退出房间（`room:leave`）；`IN_GAME` 禁止退出。
- 前端展示
  - 未入房时：先设昵称，再显示“创建房间/可用房间”。
  - 全站 UI 主题已改为米色系（浅底 + 暖色强调），背景加入 Hero Pattern 重复印花。
  - 动效已增强：阶段卡切换动效、Round 徽标变化强调、按钮按下/禁用/成功态反馈。
  - 发言阶段倒计时已放入“发言面板”，最后 10 秒进入警示色并脉冲提示。
  - 原生 `window.confirm` 已替换为前端自定义确认弹窗（可复用 Hook + 组件）。
  - 入房后信息区已拆分：
    - `LOBBY`：保留常驻准备窗口（开始/解散/退出）。
    - `IN_GAME`：不再常驻顶部信息卡，改为“队伍状态”右上角设置按钮打开“战术面板”弹窗。
  - 对局中出现断线时，全员看到断线通知与 30s 倒计时。
  - 对局中房主“强制结束对局”入口放在战术面板弹窗中。
  - 任务文案已游戏化（指令式语气），不改变原有逻辑语义。
  - 结算反馈已增强：积分变化时显示弹跳与浮动增量（如 `+1`）。
  - 队伍状态区重构：
    - 只显示当前任务进度（发言阶段显示“发言进度”，猜测阶段显示“锁码进度”）。
    - 2 队模式：自己的队伍固定在左侧（宽度 3/4），对手在右侧压缩卡（1/4），仅保留队名/积分/扇形进度。
    - 4 队与 6 队模式：自己的队伍第一行横向放满；其他队伍在下一行以小方块显示，仅显示积分与扇形进度（不显示 Team 字母）。
    - 通过卡片大小与位置区分“自己队伍”，已移除“你的队伍”文字标签。
  - 记录区改为“按队分组的简洁表”，仅显示 1/2/3/4 与线索历史行。
  - 记录区可读性优化：新增“最新轮次”标记、最新/近期/历史记录分层高亮、抽屉开合过渡优化。
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
- 词语相关度服务（新增）
  - 新增目录 `apps/word-service/`，与 Node 游戏后端分离部署。
  - 模型目录：`apps/word-service/models/`（已局部 `.gitignore` 忽略）。
  - 服务启动时会自动加载 fastText 模型并执行一次预热推理，降低首次请求延迟。
  - 提供接口：
    - `GET /health`
    - `POST /api/v1/related-words`（`word` + `k`，默认 `k=10`，受 `MAX_K` 限制）。

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
- AI 词语服务接入链路（新增）
  1. 启动 Python 词语服务（默认端口 `4201`）。
  2. Node 服务通过环境变量 `WORD_SERVICE_URL` 指向词语服务（默认 `http://127.0.0.1:4201`）。
  3. 前端触发 `ai:action` 时，Node 在 `setAgentInterface` 内调用词语服务：
     - 对每个目标词调用 `POST /api/v1/related-words` 请求 Top 10
     - 从每组近邻词随机选 1 个作为线索
     - 若请求失败则对该词使用降级线索（前 2 字）
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
  - AI 线索生成：`apps/server/src/core/ai-clue-generator.ts`
  - 词语服务客户端：`apps/server/src/core/word-service-client.ts`
  - 词库文件：`apps/server/src/data/thuocl_words_max4.txt`
  - 参数校验：`apps/server/src/core/schemas.ts`
  - 类型定义：`apps/server/src/types/game.ts`
- 前端
  - 页面：`apps/web/src/app/page.tsx`
  - 全局样式：`apps/web/src/app/globals.css`
  - socket 封装：`apps/web/src/hooks/useGameSocket.ts`
  - 自定义确认弹窗 Hook：`apps/web/src/hooks/useConfirmDialog.tsx`
  - 按钮组件：`apps/web/src/components/ActionButton.tsx`
  - 确认弹窗组件：`apps/web/src/components/ConfirmDialog.tsx`
  - 战术信息弹窗组件：`apps/web/src/components/InfoDialog.tsx`
  - 视图类型：`apps/web/src/types/game.ts`
- 词语服务（新增）
  - 入口：`apps/word-service/run.py`
  - app 组装：`apps/word-service/app/__init__.py`
  - 配置：`apps/word-service/app/config.py`
  - 路由：`apps/word-service/app/routes.py`
  - 业务服务：`apps/word-service/app/service.py`
  - 模型加载：`apps/word-service/app/model_loader.py`
  - 请求校验：`apps/word-service/app/schemas.py`
  - 错误模型：`apps/word-service/app/errors.py`
  - 依赖：`apps/word-service/requirements.txt`
  - 设计文档：`apps/word-service/DESIGN.md`
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
- AI 线索依赖外部内部服务（`apps/word-service`）；若服务未启动/超时，当前会回退到简化线索（前 2 字），可用性优先但语义质量会下降。
- Node 到词语服务调用当前默认超时为 `1500ms`（`WORD_SERVICE_TIMEOUT_MS`）；网络抖动下可能触发降级。
- 词语服务返回“随机抽取”结果，AI 线索天然不稳定（同一词多次调用可能不同），属于预期行为。
- `useGameSocket` 的 `debugMultiPlayer` 在渲染期读取 URL 参数（`window.location.search`）；在部分场景可能出现 hydration mismatch 警告（功能不受影响，但建议后续改为 mounted 后再读取以彻底消除告警）。
- 2 队模式在窄屏仍强制保持 3/4 + 1/4 横向布局（按产品要求不堆叠）；极窄宽度下右侧压缩卡信息密度较高，后续如需进一步优化可只保留图标+环形进度。

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
