# wordscorrelation

基于 fastText 中文预训练词向量（`cc.zh.300`）计算词相关性。

## 环境

- Python 3.11

## 安装依赖

```bash
python3.11 -m pip install -r wordscorrelation/requirements.txt
```

## 下载模型

```bash
python3.11 wordscorrelation/download_fasttext_zh.py
```

下载来源为 fastText 官方地址：
`https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.zh.300.bin.gz`

默认输出：
- 模型：`wordscorrelation/data/models/cc.zh.300.bin`
- 元信息：`wordscorrelation/data/fasttext_download_meta.json`

## 计算词相关性

```bash
python3.11 wordscorrelation/correlate_words.py 苹果 香蕉 水果
```

输出内容：
- 输入词两两余弦相似度矩阵
- 每个输入词的 Top-K 近邻词（默认 `--neighbors 8`）

常用参数：

```bash
# 输出 JSON
python3.11 wordscorrelation/correlate_words.py 苹果 香蕉 水果 --json

# 指定近邻词数量
python3.11 wordscorrelation/correlate_words.py 苹果 香蕉 水果 --neighbors 20

# 禁用近邻词，仅看相似度矩阵
python3.11 wordscorrelation/correlate_words.py 苹果 香蕉 水果 --neighbors 0
```

## 压缩模型（推荐）

原始 `cc.zh.300.bin` 很大，可以量化成更小的 `cc.zh.300.ftz`：

```bash
python3.11 wordscorrelation/compress_fasttext_model.py
```

常用参数：

```bash
# 更小体积（通常会有更多精度损失）
python3.11 wordscorrelation/compress_fasttext_model.py --dsub 1

# 限制词表（进一步减小体积）
python3.11 wordscorrelation/compress_fasttext_model.py --cutoff 300000
```

说明：
- `correlate_words.py` 默认会优先使用 `wordscorrelation/data/models/cc.zh.300.ftz`。
- 如果没有 `.ftz`，会自动回退到 `.bin`。
