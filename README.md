# DeviceCompare
device compare


手机对比

1. 本网站致力于通过简洁明快的页面,让消费对比不同的机型, 以方便挑选购买到合适的机型
2. 风格模仿 apple iphone 对比的页面
3. 后端只需要一个接口 
/device/phone/detail?modelList=iphone-17-pro-max,iphone-16,iphone-15-plus
requestBody: [model1, model2]
example: ["iphone 13", "iphone 17"]

responseBody:
{
	"iphone 13": {
		"display": {
			"size": "6.3 inches",
			"resolution": "2622 x 1206",
			"refresh_rate": "120Hz"
			},
		"battery": {
			"capacity_mah": 3582,
			"charging_watt": 25
		  },
		"hardware": {
			"chipset": "Apple A18 Pro",
			"ram": "8GB"
		  },
		
		"screenSize": float,
		"batteryCapacity": int
		"soc": "A15",
		"mainSensor": "Sony 818"
	}
}



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
