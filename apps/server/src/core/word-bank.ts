import { SecretWordSlot } from "../types/game.js";

const WORD_BANK: string[][] = [
  [
    "苹果",
    "海洋",
    "钟表",
    "火山"
  ],
  [
    "森林",
    "飞机",
    "丝绸",
    "电池"
  ],
  [
    "银河",
    "画笔",
    "地铁",
    "茶壶"
  ],
  [
    "冰川",
    "剧院",
    "沙漏",
    "指南针"
  ],
  [
    "雷达",
    "花园",
    "隧道",
    "乐谱"
  ],
  [
    "雪山",
    "邮票",
    "镜子",
    "齿轮"
  ]
];

export const pickSecretWords = (seed: number): SecretWordSlot[] => {
  const pack = WORD_BANK[seed % WORD_BANK.length];
  return pack.map((w, idx) => ({
    index: (idx + 1) as 1 | 2 | 3 | 4,
    zh: w
  }));
};
