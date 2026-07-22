# DeviceCompare
device compare


手机对比
我正在设计一个数码设备对比网站,目前有一个不成熟的思考,我希望你指出我的设计之中的严重问题,并补全我的设计.目前设计处于Demo阶段, 所以无需抛出过于刁钻的问题,只考虑严重的底线问题.

以下是网站设计说明书:
1. 本网站致力于通过简洁明快的页面,让消费对比不同的机型, 以方便挑选购买到合适的机型
2. 风格模仿 apple iphone 对比的页面
3. 网站初期尽可能简单,以MVP原则制作Demo,只节选部分重点参数
3. 后端只需要一个接口, 传入不同手机的机型名称,返回对应的参数.
GET /device/phone/detail?modelList={model_id1},{model_id2}
通过model_id 来对应传入的设备id,比如iphone-17-pro-max


数据库设计:
在 MVP 阶段，直接采用本地 JSON 文件作为静态数据源，启动时加载到内存中作为一级缓存。
responseBody:
{
  "iphone 13 pro": {
    "chipset": "Apple A18 Pro",
    "storage_versions": [
      { "ram_gb": 8, "rom_gb": 128, "price": 2999 },
      { "ram_gb": 12, "rom_gb": 256, "price": 3499 },
      { "ram_gb": 16, "rom_gb": 512, "price": 3999 }
    ],
    "display": {
      "size": 6.1,
      "resolution": "2532 x 1170",
      "max_refresh_rate": 120,
      "min_refresh_rate": 10
    },
    "battery": {
      "capacity_mah": 3095,
      "charging_watt": 20
    },

    "Camera": {
      "wide": {
        "sensor": "Sony IMX703",
        "resolution": "5000",
        "aperture": 1.8,
        "focal_length": 23,
        "sensor_size": 1,
        "image_stabilization": [
          "OIS",
          "EIS"
        ]
      },
      "telephoto": {
        "sensor": "Sony IMX713"
      },
      "ultra_wide": {
        "sensor": "Sony IMX772"
      },
      "rear": {
        "sensor": "Sony IMX514"
      }
    }
  }
}

组件分类
屏幕
芯片
摄像头
电池容量
充电功率
三防等级
生物识别
机身材质
机身尺寸/重量
扬声器
震动马达
数据接口: USB NFC 红外 3.5mm
OS 操作系统
GPS
蜂窝网络通讯频段

以下是对应词汇的英文表达：

1. **重量**：Weight
2. **长宽高**：Dimensions (L × W × H) 或 Size
3. **屏幕分辨率**：Screen Resolution / Display Resolution
4. **接口类型**：Port Type / Interface Type
5. **充电功率**：Charging Wattage / Charging Power
6. **边框材质**：Frame Material
7. **后盖材质**：Back Cover Material / Rear Glass Material
8. **主摄 广角镜头**：Main Camera / Wide-angle Lens
9. **长焦镜头**：Telephoto Lens
10. **超广角镜头**：Ultra-wide Lens
11. **前摄**：Front Camera / Selfie Camera
12. **光圈**：Aperture
13. **焦段**：Focal Length
14. **传感器**：Sensor
15. **分辨率**：Resolution
16. **屏幕刷新率**：Screen Refresh Rate
17. **屏幕最大亮度**：Peak Brightness / Maximum Brightness
18. ROM RAM
