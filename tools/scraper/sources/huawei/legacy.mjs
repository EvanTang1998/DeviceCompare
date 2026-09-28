// Mate 60 系列：官网参数页已下架，但**官方 CDN 上的分色图还活着**
//
// 现状（2026-09 实测）：
//   /cn/phones/mate60*/specs/  → 301 跳到 /cn/phones/（参数页没了）
//   /content/dam/.../phones/mate60*/img/specs-img/<color>.png → 200（图还在，RS 的目录是 img/specs/）
//   vmall 商城搜不到这几台手机的商品（只剩第三方手机壳），官网其他入口（support / compare）都没有参数
//   本机网络到 archive.org 不通（curl 000），只能用 WebFetch 读存档页
//
// 所以这一代走 **legacy 通道**（与小米 12/11/10 系列的 LEGACY_MODELS 同一思路）：
//   参数 = 官网参数页的 Wayback 存档原文，**人工逐条转录**在下面的 sections 字段里
//   图片 = 官网 CDN 现存活直链，仍走同一套 normalize.py（铺白 / 裁紧 / 缩放进 612×760 / 背板取色）
//   解析 = 复用 specs.mjs 的 buildDevice（同一批 builders），所以 JSON 形状与 Mate 70/80 完全一致
//
// 核对记录（2026-09-24）：
//   - 参数与配色：https://web.archive.org/web/2024/https://consumer.huawei.com/cn/phones/<slug>/specs/
//   - 卫星口径：官网**产品页**存档（当年参数页就不列这一行）
//       mate60 Pro / Pro+ / RS → 官网原文「卫星通话」「卫星消息」
//       mate60（标准版）      → 官网原文「双向北斗卫星消息」，**没有**卫星通话
//   - 发布日期（官网参数页没有，取自发布会公开信息）：mate60 / Pro 2023-08、Pro+ 2023-09、RS 2023-09
//
// ⚠ 本文件是人工维护的：改数据请改这里，并更新上面的核对记录，不要指望重新抓取覆盖。

const CDN = "https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/pdp/phones";

// 60 / 60 Pro / 60 Pro+ 的屏幕规格是同一块，三台共用这段，避免转录时抄错
const SCREEN_ROWS = [
  ["尺寸", ["6.82 英寸"]],
  ["色彩", ["10.7 亿色，P3 广色域"]],
  ["类型", ["OLED；支持 1-120 Hz LTPO 自适应刷新率；1440 Hz 高频 PWM 调光；300 Hz 触控采样率"]],
  ["分辨率", ["FHD+ 2720 × 1260 像素"]],
];

// Pro / Pro+ / RS 的感应器一致（都有 3D 人脸识别 + 气压计 + 屏内指纹）
const SENSORS_PRO = [
  "3D 人脸识别",
  "姿态感应器",
  "重力传感器",
  "红外传感器",
  "屏内指纹",
  "霍尔传感器",
  "气压计",
  "陀螺仪",
  "指南针",
  "环境光传感器",
  "接近光传感器",
  "Camera 激光对焦传感器",
  "色温传感器",
];

export const LEGACY = {
  "huawei-mate60": {
    meta: { name: "HUAWEI Mate 60", series: "Mate 系列", release_date: "2023-08" },
    archive: "https://web.archive.org/web/2024/https://consumer.huawei.com/cn/phones/mate60/specs/",
    note: "标准版：官网感应器列表里**没有**人脸识别、前置也只有一颗 1300 万（没有 3D 深感），按官网口径 face_unlock 留 null",
    satellite: "双向北斗卫星消息",
    colors: [
      { name: "雅川青", imgUrl: `${CDN}/mate60/img/specs-img/green.png` },
      { name: "白沙银", imgUrl: `${CDN}/mate60/img/specs-img/silver.png` },
      { name: "南糯紫", imgUrl: `${CDN}/mate60/img/specs-img/purple.png` },
      { name: "雅丹黑", imgUrl: `${CDN}/mate60/img/specs-img/black.png` },
    ],
    sections: {
      尺寸与重量: [
        ["长度", ["161.4 mm"]],
        ["宽度", ["76 mm"]],
        ["厚度", ["7.95 mm"]],
        ["重量", ["约 209 g（含电池）"]],
      ],
      屏幕: [
        ["尺寸", ["6.69 英寸"]],
        ["色彩", ["10.7 亿色，P3 广色域"]],
        ["类型", ["OLED；支持 1-120 Hz LTPO 自适应刷新率；1440 Hz 高频 PWM 调光；300 Hz 触控采样率"]],
        ["分辨率", ["FHD+ 2688 × 1216 像素"]],
        ["玻璃类型", ["第二代昆仑玻璃"]],
      ],
      操作系统: [["", ["鸿蒙操作系统 4.0"]]],
      存储: [
        ["运行内存", ["12 GB RAM"]],
        ["机身内存", ["256 GB / 512 GB / 1 TB ROM"]],
      ],
      后置摄像头: [
        [
          "后置摄像头",
          [
            "5000 万像素超光变摄像头（F1.4-F4.0 光圈，OIS 光学防抖）",
            "1200 万像素超广角摄像头（F2.2 光圈）",
            "1200 万像素潜望式长焦摄像头（F3.4 光圈，OIS 光学防抖）",
          ],
        ],
        [
          "后置摄像头变焦模式",
          ["支持 5 倍光学变焦（5 倍变焦为近似值，镜头焦段分别为 24 mm，13 mm，125 mm）、50 倍数字变焦"],
        ],
      ],
      前置摄像头: [["前置摄像头", ["1300 万像素超广角摄像头（F2.4 光圈）"]]],
      电池: [["", ["4750 mAh（典型值）"]]],
      充电: [
        [
          "有线充电",
          [
            "手机支持最大超级快充 11V/6A，兼容 10V/4A 或 10V/2.25A 或 4.5V/5A 或 5V/4.5A 超级快充，兼容 9V/2A 快充。",
          ],
        ],
        ["无线充电", ["支持 50 W 华为无线超级快充，支持无线反向充电。"]],
        // 瓦数只在脚注里（与 Mate 70 同样写法），buildBattery 有脚注兜底
        ["", ["*最大支持 66 W 华为有线超级快充，需搭配 66 W 或 88 W 华为超级快充充电套装使用。"]],
      ],
      防尘抗水: [["", ["IP68 级别"]]],
      NFC: [["", ["支持读卡器模式，卡模拟模式（华为钱包支付，SIM 卡支付*，HCE 支付）"]]],
      感应器: [
        [
          "",
          [
            "姿态感应器",
            "重力传感器",
            "红外传感器",
            "屏内指纹",
            "霍尔传感器",
            "陀螺仪",
            "指南针",
            "环境光传感器",
            "接近光传感器",
            "Camera 激光对焦传感器",
            "色温传感器",
          ],
        ],
      ],
    },
  },

  "huawei-mate60-pro": {
    meta: { name: "HUAWEI Mate 60 Pro", series: "Mate 系列", release_date: "2023-08" },
    archive: "https://web.archive.org/web/2024/https://consumer.huawei.com/cn/phones/mate60-pro/specs/",
    satellite: "卫星通话、卫星消息",
    colors: [
      { name: "雅川青", imgUrl: `${CDN}/mate60-pro/img/specs-img/green.png` },
      { name: "白沙银", imgUrl: `${CDN}/mate60-pro/img/specs-img/silver.png` },
      { name: "南糯紫", imgUrl: `${CDN}/mate60-pro/img/specs-img/purple.png` },
      { name: "雅丹黑", imgUrl: `${CDN}/mate60-pro/img/specs-img/black.png` },
    ],
    sections: {
      尺寸与重量: [
        ["长度", ["163.65 mm"]],
        ["宽度", ["79 mm"]],
        ["厚度", ["8.1 mm"]],
        ["重量", ["约 225 g（含电池）"]],
      ],
      屏幕: [...SCREEN_ROWS, ["玻璃类型", ["第二代昆仑玻璃"]]],
      操作系统: [["", ["鸿蒙操作系统 4.0"]]],
      存储: [
        ["运行内存", ["12 GB RAM"]],
        ["机身内存", ["256 GB / 512 GB / 1 TB ROM"]],
      ],
      后置摄像头: [
        [
          "后置摄像头",
          [
            "5000 万像素超光变摄像头（F1.4-F4.0 光圈，OIS 光学防抖）",
            "1200 万像素超广角摄像头（F2.2 光圈）",
            "4800 万像素超微距长焦摄像头（F3.0 光圈，OIS 光学防抖）",
          ],
        ],
        [
          "后置摄像头变焦模式",
          ["支持 3.5 倍光学变焦（3.5 倍变焦为近似值，镜头焦段分别为 24 mm，13 mm，90 mm）、100 倍数字变焦"],
        ],
      ],
      前置摄像头: [["前置摄像头", ["1300 万像素超广角摄像头（F2.4 光圈）", "3D 深感摄像头"]]],
      电池: [["", ["5000 mAh（典型值）"]]],
      充电: [
        [
          "有线充电",
          [
            "手机支持最大超级快充 88 W（20V/4.4A），兼容 11V/6A 或 10V/4A 或 10V/2.25A 或 4.5V/5A 或 5V/4.5A 超级快充，兼容 9V/2A 快充。",
          ],
        ],
        ["无线充电", ["支持 50 W 华为无线超级快充，支持 20 W 无线反向充电。"]],
      ],
      防尘抗水: [["", ["IP68 级别"]]],
      NFC: [["", ["支持读卡器模式，卡模拟模式（华为钱包支付，SIM 卡支付*，HCE 支付）"]]],
      感应器: [["", SENSORS_PRO]],
    },
  },

  "huawei-mate60-pro-plus": {
    meta: { name: "HUAWEI Mate 60 Pro+", series: "Mate 系列", release_date: "2023-09" },
    archive: "https://web.archive.org/web/2024/https://consumer.huawei.com/cn/phones/mate60-pro-plus/specs/",
    satellite: "卫星通话、卫星消息",
    colors: [
      { name: "宣白", imgUrl: `${CDN}/mate60-pro-plus/img/specs-img/white.png` },
      { name: "砚黑", imgUrl: `${CDN}/mate60-pro-plus/img/specs-img/black.png` },
    ],
    sections: {
      尺寸与重量: [
        ["长度", ["163.65 mm"]],
        ["宽度", ["79 mm"]],
        ["厚度", ["8.1 mm"]],
        ["重量", ["约 225 g（含电池）"]],
      ],
      屏幕: [...SCREEN_ROWS, ["玻璃类型", ["第二代昆仑玻璃"]]],
      操作系统: [["", ["鸿蒙操作系统 4.0"]]],
      存储: [
        ["运行内存", ["16 GB RAM"]],
        ["机身内存", ["512 GB / 1 TB ROM"]],
      ],
      后置摄像头: [
        [
          "后置摄像头",
          [
            "4800 万像素超聚光摄像头（F1.4-F4.0 光圈，OIS 光学防抖）",
            "4000 万像素超广角摄像头（F2.2 光圈）",
            "4800 万像素超微距长焦摄像头（F3.0 光圈，OIS 光学防抖）",
          ],
        ],
        [
          "后置摄像头变焦模式",
          ["支持 3.5 倍光学变焦（3.5 倍变焦为近似值，镜头焦段分别为 24 mm，13 mm，90 mm）、100 倍数字变焦"],
        ],
      ],
      前置摄像头: [["前置摄像头", ["1300 万像素超广角摄像头（F2.4 光圈）", "3D 深感摄像头"]]],
      电池: [["", ["5000 mAh（典型值）"]]],
      充电: [
        [
          "有线充电",
          [
            "手机支持最大超级快充 88 W（20V/4.4A），兼容 11V/6A 或 10V/4A 或 10V/2.25A 或 4.5V/5A 或 5V/4.5A 超级快充，兼容 9V/2A 快充。",
          ],
        ],
        ["无线充电", ["支持 50 W 华为无线超级快充，支持 20 W 无线反向充电。"]],
      ],
      防尘抗水: [["", ["IP68 级别"]]],
      NFC: [["", ["支持读卡器模式，卡模拟模式（华为钱包支付，SIM 卡支付*，HCE 支付）"]]],
      感应器: [["", SENSORS_PRO]],
    },
  },

  "huawei-mate60-rs": {
    meta: { name: "HUAWEI Mate 60 RS 非凡大师", series: "Mate 系列", release_date: "2023-09" },
    archive:
      "https://web.archive.org/web/2024/https://consumer.huawei.com/cn/phones/mate60-rs-ultimate-design/specs/",
    note: "官网重量按配色分两个值（玄黑 约 242 g / 瑞红 约 246 g），schema 只有一个 weight_g，取默认色玄黑的 242 g",
    satellite: "卫星通话、卫星消息",
    colors: [
      { name: "玄黑", imgUrl: `${CDN}/mate60-rs-ultimate-design/img/specs/black.png` },
      { name: "瑞红", imgUrl: `${CDN}/mate60-rs-ultimate-design/img/specs/red.png` },
    ],
    sections: {
      尺寸与重量: [
        ["长度", ["163.65 mm"]],
        ["宽度", ["79 mm"]],
        ["厚度", ["8.1 mm"]],
        ["重量", ["玄黑：约 242 g（含电池）", "瑞红：约 246 g（含电池）"]],
      ],
      屏幕: [...SCREEN_ROWS, ["玻璃类型", ["玄武钢化昆仑玻璃"]]],
      操作系统: [["", ["鸿蒙操作系统 4.0"]]],
      存储: [
        ["运行内存", ["16 GB RAM"]],
        ["机身内存", ["512 GB / 1 TB ROM"]],
      ],
      后置摄像头: [
        [
          "后置摄像头",
          [
            "4800 万像素超聚光摄像头（F1.4-F4.0 光圈，OIS 光学防抖）",
            "4000 万像素超广角摄像头（F2.2 光圈）",
            "4800 万像素超微距长焦摄像头（F3.0 光圈，OIS 光学防抖）",
          ],
        ],
        [
          "后置摄像头变焦模式",
          ["支持 3.5 倍光学变焦（3.5 倍变焦为近似值，镜头焦段分别为 24 mm，13 mm，90 mm）、100 倍数字变焦"],
        ],
      ],
      前置摄像头: [["前置摄像头", ["1300 万像素超广角摄像头（F2.4 光圈）", "3D 深感摄像头"]]],
      电池: [["", ["5000 mAh（典型值）"]]],
      充电: [
        [
          "有线充电",
          [
            "手机支持最大超级快充 88 W（20V/4.4A），兼容 11V/6A 或 10V/4A 或 10V/2.25A 或 4.5V/5A 或 5V/4.5A 超级快充，兼容 9V/2A 快充。",
          ],
        ],
        ["无线充电", ["支持 50 W 华为无线超级快充，支持 20 W 无线反向充电。"]],
      ],
      防尘抗水: [["", ["IP68 级别"]]],
      NFC: [["", ["支持读卡器模式，卡模拟模式（华为钱包支付，SIM 卡支付*，HCE 支付）"]]],
      感应器: [["", SENSORS_PRO]],
    },
  },
};

/** legacy 机型的 sections 是 [条目名, 值数组] 的紧凑写法，这里转成 parseSections 的 {k, v} 形状 */
export function toSectionMap(sections) {
  const map = new Map();
  for (const [group, rows] of Object.entries(sections)) {
    map.set(
      group,
      rows.map(([k, v]) => ({ k: k || null, v }))
    );
  }
  return map;
}
