手机对比
我正在设计一个数码设备对比网站,目前有一个不成熟的思考,我希望你指出我的设计之中的严重问题,并补全我的设计.目前设计处于Demo阶段, 所以无需抛出过于刁钻的问题,只考虑严重的底线问题.

以下是网站设计说明书:
1. 本网站致力于通过简洁明快的页面,让消费对比不同的机型, 以方便挑选购买到合适的机型
2. 风格模仿 apple iphone 对比的页面
3. 网站初期尽可能简单,以MVP原则制作Demo
4. 数据来源： 直接采用本地 JSON 文件作为静态数据源
5. 

核心字段:
基础元数据: 定义商品本身的参数,如型号,发布时间,起售价,与
model_id: String 唯一业务标识，如 iphone-17-pro-max
brand: String 品牌 如 apple
device_type: String 设备类型 如 phone 
model_name: String 展示名称，e.g.,iPhone 17 Pro Max
release_date: String "2024-09-10"
specs: JSON 设备详细参数



{
	"iphone 13 pro": {
		"display": {
			"size": 6.1,
			"resolution": "2532 x 1170",
			"refresh_rate": "10-120Hz"
			},
		"battery": {
			"capacity_mah": 3095,
			"charging_watt": 20
		  },
			"chipset": "Apple A15 Pro",
			"ram": "6GB",
		"Camera": {
			"main": {"sensor": "Sony IMX703", 
						"resolution": "5000", 
						"aperture": "",
						"focalLength":"",
						"sensorSize",
						"image_stabilization": ["OIS", "EIS"]},
			"Telephoto": {"sensor": "Sony IMX713"},
			"Ultra-wide": {"sensor": "Sony IMX772"},
			"Rear": {"sensor": "Sony IMX514"}
		}
	}
}

芯片组：芯片、存储、运存、插口
摄像头
屏幕
电池
外观： 尺寸 材质 三防等级
扬声器
网络
GPS
系统
震动马达
数据接口: USB NFC 红外 3.5mm
蜂窝网络通讯频段



英文表达：
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


