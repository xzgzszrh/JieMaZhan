# 词汇相关度服务设计（独立部署）

## 1. 目标

新增一个独立的 Python 服务，专门提供中文词语相关度查询能力，与现有游戏后端（Node + Socket.io）分离部署。

本阶段仅产出设计，不包含代码实现。

## 2. 目录与边界

- 服务目录：`apps/word-service`
- 现有词向量与相关脚本来源：`wordscorrelation/`
- 调用关系：`apps/server` 通过 HTTP 调用 `apps/word-service`
- 前端不直接调用 Python 服务（避免暴露内部服务与模型细节）

## 3. 技术方案

- 语言：Python 3.11
- Web 框架：Flask
- 响应格式：JSON
- 模型：fastText 中文词向量（优先 `cc.zh.100.bin`，回退 `cc.zh.300.bin`）

## 4. HTTP API 设计

### 4.1 健康检查

- 方法：`GET`
- 路径：`/health`
- 用途：部署探活/监控
- 成功响应（200）：

```json
{
  "ok": true,
  "service": "word-service",
  "ts": 1739580000000
}
```

### 4.2 近邻词查询

- 方法：`POST`
- 路径：`/api/v1/related-words`
- 请求体：

```json
{
  "word": "苹果",
  "k": 10
}
```

- 字段约束：
  - `word`：必填，字符串，去除首尾空白后不能为空
  - `k`：可选，整数，默认 `10`，最大值受服务端限制（建议 `MAX_K=50`）

- 成功响应（200）：

```json
{
  "word": "苹果",
  "k": 10,
  "neighbors": [
    { "word": "水果", "score": 0.8123 },
    { "word": "香蕉", "score": 0.7988 }
  ],
  "model": {
    "path": "wordscorrelation/data/models/cc.zh.100.bin",
    "dimension": 100
  }
}
```

- 行为约定：
  - 近邻结果必须排除输入词本身（完全相同字符串）
  - 本阶段不做“仅中文词”过滤
  - 为保证排除后仍返回足量，内部可请求 `k + buffer`，再过滤并截断到 `k`

## 5. 错误语义

- `400 Bad Request`
  - 参数缺失或非法（如 `word` 为空、`k` 非正整数）
- `503 Service Unavailable`
  - 模型不可用（路径不存在、加载失败）
- `500 Internal Server Error`
  - 其他未预期错误

错误响应格式建议统一：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "k must be an integer between 1 and 50"
  }
}
```

## 6. 配置约定

建议通过环境变量配置：

- `PORT`：服务监听端口（示例：`4201`）
- `FASTTEXT_MODEL_PATH`：模型路径（可选，不传则按默认探测规则）
- `MAX_K`：`k` 的上限（默认建议 `50`）
- `REQUEST_TIMEOUT_MS`：单次请求超时（用于上游调用约定）

## 7. 性能与资源策略

- 模型在服务启动时加载一次，进程内复用
- 不在每个请求中重复加载模型
- 首次启动可能较慢（模型加载），但请求路径应保持轻量
- 单实例先满足当前规模；后续按并发情况再评估多进程/多实例

## 8. 与 Node 游戏后端集成设计

### 8.1 调用方式

- `apps/server` 内新增词汇服务客户端（HTTP）
- 通过环境变量配置 Python 服务地址，例如：
  - `WORD_SERVICE_URL=http://127.0.0.1:4201`

### 8.2 Node -> Python 请求协议

- Node 发起：`POST {WORD_SERVICE_URL}/api/v1/related-words`
- 请求体：`{ "word": "<中文词>", "k": 10 }`
- Node 侧需设置超时、重试策略（建议先无重试，避免连锁放大）

### 8.3 失败降级建议

- Python 服务不可用时：
  - 记录错误日志（含状态码/超时原因）
  - 返回明确业务错误给调用点（避免静默失败）

## 9. 部署与运行建议

- 与 `apps/server` 分离部署（独立端口/容器）
- 初期本地开发可同机运行：
  - `apps/server`：`4100`
  - `apps/word-service`：`4201`
- 生产环境建议内部网络访问，不直接对公网暴露

## 10. 本阶段确认结果（已锁定）

1. 目录路径固定：`apps/word-service`
2. 保留 `GET /health`
3. 近邻结果排除输入词本身
4. 暂不做中文过滤
5. `k` 允许客户端传入并限制上限
6. 由 Node 后端通过 HTTP 调用 Python 服务
