# 猜词截码战 - 项目交接草稿（v1）

## 1. 目标与范围
- 目标：实现多人在线猜词截码战，规则为“按顺序描述三词、组内猜顺序、他组截获、统一积分、先到 2 分获胜（支持并列）”。
- 范围：`apps/server`（Express + Socket.io）与 `apps/web`（Next.js App Router）。

## 2. 已确认规则（最终）
- 每组 2 人，每组 4 个词（编号 1/2/3/4）。
- 每轮发言者拿到 3 位不重复编号（从 1-4 抽 3 个），并按顺序描述。
- 本组猜对：本组不加分。
- 其他组猜对该组顺序：猜中组 +1 分。
- 本组猜错：其他所有组各 +1 分。
- 达到 2 分即获胜；若同轮多队达标，则并列胜利。
- 发言顺序沿用现有轮转顺序。

## 3. 当前实现状态（已落地）
- 游戏核心
  - 统一积分字段：`Team.score`（已启用）。
  - 回合结算使用新规则（截获加分 + 内猜错误全员加分）。
  - 胜负判定：`score >= 2`；并列胜利通过 `winnerTeamIds` 表示。
  - 历史记录新增 `scoreDeltas`，记录本轮“谁因何加分”。
- 房间能力
  - 房间创建后命名为 `XXX的房间`（`XXX` 为房主昵称）。
  - 大厅支持可加入房间列表（无需手输房间号）。
  - 支持实时房间列表推送：`rooms:update`。
  - 房主可解散房间；成员可在 `LOBBY` 阶段退出房间。
- 前端展示
  - 队伍状态已统一为“积分”术语。
  - 对局结束支持显示并列胜者。
  - 房间内显示房间名称与房间号。
  - 记录区显示本轮加分摘要。

## 4. 关键链路（交接必读）
- 创建房间
  - `room:create` -> 返回 `roomId/playerId`
  - 服务端生成 `roomName: ${nickname}的房间`
  - 广播 `rooms:update`
- 加入房间
  - 客户端先 `room:list` 或被动接收 `rooms:update`
  - 用户选择某房间后一键 `room:join`
- 房间内实时同步
  - 服务端按玩家投影视图推送 `state:update`
  - 仅当前 speaker 可见当轮编码
- 退出/解散
  - 成员：`room:leave`（仅 LOBBY）
  - 房主：`room:disband`（任意阶段）
  - 服务端会发 `session:cleared`，客户端收到后清空本地身份并回到大厅态

## 5. 当前 Socket 事件
- Client -> Server
  - `room:list`
  - `room:create`
  - `room:join`
  - `room:reconnect`
  - `room:leave`
  - `room:disband`
  - `game:start`
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
  - 参数校验：`apps/server/src/core/schemas.ts`
  - 类型定义：`apps/server/src/types/game.ts`
- 前端
  - 页面：`apps/web/src/app/page.tsx`
  - socket 封装：`apps/web/src/hooks/useGameSocket.ts`
  - 视图类型：`apps/web/src/types/game.ts`

## 7. 已知限制与风险
- `leaveRoom` 目前仅允许 `LOBBY` 阶段，开局后成员主动退出会被拒绝。
- 已完成旧字段清理：`bombs/raspberries/eliminated/winnerTeamId` 已从 server/web 类型与协议中移除，统一使用 `score/winnerTeamIds`。

## 8. 建议下一步（交接后）
- 决策并实现“对局中成员退出”规则（托管、判负、替补或重连窗口）。
- 补充一次协议变更记录（字段移除说明 + 客户端兼容策略），便于后续多人并行开发。
- 补充端到端用例（4/6/8 人、并列胜利、解散与退出链路）。
