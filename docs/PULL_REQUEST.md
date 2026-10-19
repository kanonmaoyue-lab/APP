# 小日子：iPad 日历、间隔复习和粉色萌猫界面

为 iPad 实现「小日子 Little Days」日历 PWA：日／周／月行程、笔记式间隔复习、账号认证、离线队列和云端冲突处理，以及道路动线预览与明确采用。支持精确分钟编辑、独立触控长按拖动和重复例外；复习按实际评分日计算下一次日期，每主题每天最多评分一次。

按用户最新要求采用淡粉渐变、深莓粉文字、18px正文和自托管站酷快乐体，加入三张同角色原创二次元猫插画、猫爪导航与新版应用图标。字体授权完整保留，插画与字体纳入静态离线缓存。

2026-10-17 本地验证：类型检查、35个单元／组件用例、11个Chromium浏览器用例、生产离线重开／编辑／重连／导出通过；新离线字体用例观察失败后修复。布局／拖动专项5/5，834×1194、1194×834及390×844截图无横向溢出。同次重建后端验证了25个pgTAP断言、5个SDK集成和4个Edge契约用例。

界面截图：
- [日历](https://github.com/kanonmaoyue-lab/APP/blob/codex/little-days-pink/docs/screenshots/pink-ipad-calendar.png)
- [复习](https://github.com/kanonmaoyue-lab/APP/blob/codex/little-days-pink/docs/screenshots/pink-ipad-reviews.png)
- [登录](https://github.com/kanonmaoyue-lab/APP/blob/codex/little-days-pink/docs/screenshots/pink-ipad-login.png)

交接与复现见 HANDOFF.md、CLOUD_START.md 与 README。真实 Supabase 项目、生产邮件、ORS／莫干山校区覆盖、HTTPS部署、WebKit和真iPad尚未验收；路线浏览器用例明确使用地图替身。夏令时回拨重复小时的时间轴显示仍为延后问题。此 PR 不执行部署。


2026-10-19 重新验证：生产构建、35个单元／组件、5个SDK集成、11个Chromium浏览器及生产离线用例通过。本地 Edge 兼容镜像增加固定官方摘要的启动包装器，避免内部 Auth 请求被重复注入的代理变量送到外部代理；只为内部 kong 增加例外，保留外部代理和TLS。真实 HTTP 检查验证匿名401、登录后无效输入400、非法来源403，不消耗地图配额。启动与检查命令已写入 CLOUD_START.md。
