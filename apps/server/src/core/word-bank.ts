import { SecretWordSlot } from "../types/game.js";

const WORD_BANK: Array<Array<{ zh: string; en: string }>> = [
  [
    { zh: "苹果", en: "Apple" },
    { zh: "海洋", en: "Ocean" },
    { zh: "钟表", en: "Clock" },
    { zh: "火山", en: "Volcano" }
  ],
  [
    { zh: "森林", en: "Forest" },
    { zh: "飞机", en: "Airplane" },
    { zh: "丝绸", en: "Silk" },
    { zh: "电池", en: "Battery" }
  ],
  [
    { zh: "银河", en: "Galaxy" },
    { zh: "画笔", en: "Brush" },
    { zh: "地铁", en: "Subway" },
    { zh: "茶壶", en: "Teapot" }
  ],
  [
    { zh: "冰川", en: "Glacier" },
    { zh: "剧院", en: "Theater" },
    { zh: "沙漏", en: "Hourglass" },
    { zh: "指南针", en: "Compass" }
  ],
  [
    { zh: "雷达", en: "Radar" },
    { zh: "花园", en: "Garden" },
    { zh: "隧道", en: "Tunnel" },
    { zh: "乐谱", en: "Score" }
  ],
  [
    { zh: "雪山", en: "Snow Mountain" },
    { zh: "邮票", en: "Stamp" },
    { zh: "镜子", en: "Mirror" },
    { zh: "齿轮", en: "Gear" }
  ]
];

export const pickSecretWords = (seed: number): SecretWordSlot[] => {
  const pack = WORD_BANK[seed % WORD_BANK.length];
  return pack.map((w, idx) => ({
    index: (idx + 1) as 1 | 2 | 3 | 4,
    zh: w.zh,
    en: w.en
  }));
};
