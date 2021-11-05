# Proxy-Rulesets
**自用代理規則集 2021.11.04**  



## 推薦的轉換前端
[Netlify | sub-web.netlify.app](https://sub-web.netlify.app)     
[邊緣 | bianyuan.xyz](https://bianyuan.xyz)



## 本地後端搭建指路
[https://github.com/tindy2013/subconverter](https://github.com/tindy2013/subconverter)



## 遠程配置文件
### Jsdelivr(繁中)
```
https://cdn.jsdelivr.net/gh/zhouweiluan/Proxy-Rulesets@master/config/zhouweiluan_Jsdelivr.ini
```
### Githubusercontent(繁中)
```
https://raw.githubusercontent.com/zhouweiluan/Proxy-Rulesets/master/config/zhouweiluan.ini
```
### Jsdelivr(簡中)
```
https://cdn.jsdelivr.net/gh/zhouweiluan/Proxy-Rulesets@master/config/zhouweiluan_CHS_Jsdelivr.ini
```
### Githubusercontent(簡中)
```
https://raw.githubusercontent.com/zhouweiluan/Proxy-Rulesets/master/config/zhouweiluan_CHS.ini
```


## 主要內容點
 - 添加了 Mail 規則段，可控制 iCloud 郵箱是否走 Proxy 
 - 獨立出 Steam、Bilibili、Paypal 規則  
 - 防止 Apple 走 Proxies 時 Apple 地圖會使用非高德數據的問題  
 - 某些線路 shasso.com 無法連接，已默認走 DIRECT  
 - 刪除了一些 IP 檢測站走 DIRECT 的規則  
 - 刪除了 Netease 規則  
 - 中文化了一些規則組名，多個關鍵字詞匹配轉替為繁中，繁中愛好者的福音，另有簡中提供

![預覽2021.11.04](https://raw.githubusercontent.com/zhouweiluan/Proxy-Rulesets/master/Image/預覽2021.11.04.png)
