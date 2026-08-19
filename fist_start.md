① 网站名称: 火眸 - 手机对比网站
② 首页布局： 不考虑首页
③ Compare 页面布局：参照iphone compare页面，顶部放手机图片，下方 是一个 多层下拉框（兼具搜索功能），可以查找不同的品牌、手机型号。然后就是每个手机参数。
④ 手机 JSON 数据结构
export const phones = [
  {
    id: "iphone-17-pro",
    brand: "Apple",
    name: "iPhone 17 Pro",
    image: "/phones/iphone-17-pro.png",
    display: {
      size: "6.3 inch",
      refreshRate: "120Hz"
    },
    performance: {
      chipset: "A19 Pro",
      ram: "12GB"
    },
    battery: {
      capacity: "3988mAh",
      charging: "40W"
    }
  },
  {
    id: "xiaomi-17",
    brand: "Xiaomi",
    name: "Xiaomi 17",
    image: "/phones/xiaomi-17.png",
    display: {
      size: "6.3 inch",
      refreshRate: "120Hz"
    },
    performance: {
      chipset: "Snapdragon 8 Elite Gen 5",
      ram: "12GB"
    },
    battery: {
      capacity: "6330mAh",
      charging: "100W"
    }
  }
]
