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

原始 `cc.zh.300.bin` 很大，推荐做“降维压缩”（300 维降到更低维）：

```bash
python3.11 wordscorrelation/compress_fasttext_model.py
```

常用参数：

```bash
# 平衡体积与效果（推荐）
python3.11 wordscorrelation/compress_fasttext_model.py --dim 100

# 更小体积（可能有更明显精度损失）
python3.11 wordscorrelation/compress_fasttext_model.py --dim 50
```

说明：
- fastText 的 `quantize()` 仅支持 supervised 模型，不适用于 `cc.zh.300.bin` 这种词向量模型。
- 当前脚本输出为降维后的 `wordscorrelation/data/models/cc.zh.100.bin`（可通过 `--output` 改名）。
- `correlate_words.py` 默认会优先使用 `cc.zh.100.bin`，没有则回退到 `cc.zh.300.bin`。
