# 小日子 · Little Days

iPad 优先的日历 PWA：淡粉渐变、莓粉文字、原创二次元萌猫，以及自托管站酷快乐体（正文18px）。日历自由编辑、笔记式间隔复习、离线云同步和真实道路动线建议。

本次代码根据本对话已确认的需求重新实现。之前的本地提交没有随云工作区恢复；详见 [恢复检查](docs/RECOVERY.md)。本地提交、远端备份和发布环境快照是三件事，不能把其中一项当作另一项已完成。

视觉素材与字体授权见 [素材说明](public/ASSETS.md)。

## 已实现功能与边界

- 日／周／月，精确分钟，独立触控长按拖动与滚动，分类颜色、固定预约、重复规则与当次例外、完成、时间重叠提醒、拖动和路线撤销。重复系列删除后保留已完成例外的历史。
- 笔记主题与复习记录；初始次日复习，等级对应 `[1,3,7,14,30]` 天。忘记回0级、模糊降一级、记住升一级（0至4），按实际评分日重新计算，每主题每天至多一次。可放入日程，安排时间不等于评分。
- Supabase 邮箱验证／登录／密码恢复；Dexie 账号基线和顺序离线队列；服务器锁、CAS、幂等回执与完整批次游标；冲突保留两版，可采用云端／此设备或另存。退出检查未同步修改；账号切换隐藏旧数据。
- 地点搜索需明确选定具体匹配；按真实步行／骑行矩阵为最多8个目的地枚举顺序，保留固定预约并避开未选事项的占用时间。预览不写日程，明确采用才原子提交；过时的账号游标会被拒绝。
- JSON 导出含本地记录、删除历史与冲突版本，不含登录 session、token 或网络请求。SW 只缓存静态资源，有待同步修改时不会点击更新就强制刷新。

主要使用地点为浙江工业大学（莫干山校区）。**没有配置 ORS 密钥，也没有验证校内地名、校门连通和步行／骑行覆盖**。路线浏览器测试使用明确标记的服务替身，验证流程，不冒充真实地图验收。Google Maps HTTPS 导航链接携带坐标与出行方式，其在当地网络可用性也待验证。

未创建第三方项目、未集成 Todoist、未部署 HTTPS 网站。尚需托管 Supabase、生产邮件、ORS 与校区覆盖、WebKit 和真实 iPad 安装验收；本地测试不能代替这些结果。

## 开发环境

需要 Node >=24.19、npm、Docker。依赖和工具固定在 `package-lock.json`。当前云环境 Linux x64／Docker VFS 的可复现安装：

```sh
bash scripts/cloud-install.sh
npm run dev -- --mode test
```

脚本安装依赖、校验镜像准备工具、启动本地服务、生成 gitignored `.env.test.local` 的公开绑定、类型检查与构建。默认使用现有系统 Chromium；WebKit 需要额外官方下载，网络可用后执行：

```sh
INSTALL_WEBKIT=1 bash scripts/cloud-install.sh
```

本会话 Chromium 官方下载返回 403 Domain forbidden，因此保留系统 Chromium 测试结果，**不声明 WebKit 已验证**。浏览器缓存使用 `/workspace/.cache/ms-playwright`。平台环境设置草稿的域名保存与运行时生效／发布分开，保存草稿不会解除当前请求限制。

其他平台可用标准 Supabase 镜像，无需 VFS 兼容工具：

```sh
npm ci
npm run backend:start
node scripts/local.mjs
npm run dev -- --mode test
```

`local.mjs` 只接受 loopback 后端，公开 URL／发布密钥写入本地测试文件，service-role 仅留在测试进程内，不打印。已有配置不同时拒绝覆盖。开发正式云绑定时复制 `.env.example` 为 `.env.local`；前端的 URL 和 publishable key 是公开配置。服务端 key 不进入浏览器或版本库。

本地地图代理需另外运行 `node scripts/backend.mjs functions serve route-service --env-file .env.edge.local`；先用 `cp -n scripts/local-edge-proxy/local.env.example .env.edge.local` 准备非秘密的允许来源。`node scripts/check-local-route.mjs` 用真实 Auth 检查匿名401、登录后无效请求400和非法来源403，不调用道路服务。详细代理兼容说明见 CLOUD_START。没有 ORS key 时仍不能获得真实路线。

邮箱验证和恢复测试使用本地 Mailpit 捕获邮件，不能据此认为生产邮箱已经可投递。服务进程不保证跨任务存活，后续启动必须检查真实 API 功能与健康状态。

## 验证

本次结果与接续状态见 [HANDOFF](docs/HANDOFF.md)，启动步骤见 [CLOUD_START](docs/CLOUD_START.md)。

```sh
npm run typecheck
npm test -- --run
npm run test:db
npm run test:integration
npm run test:edge
npm exec -- vite build --mode test
npm run test:e2e -- --project=chromium
node scripts/production-test.mjs
npm exec -- playwright test --config=playwright.production.config.ts --project=chromium
npm run build
```

DB 的 pgTAP 事务回滚；SDK／浏览器测试创建的临时账号清理。本地辅助器不接受生产 URL。测试构建 `.test-dist` 含固定身份的显式夹具页；普通 `dist` 和生产模式专用 `.production-test-dist` 不包含夹具页。生产测试只注入本地公开绑定，验证 SW 离线重开→编辑→真实重连同步及备份下载。两套浏览器测试的输出目录分开，避免并发删除彼此的 trace。

WebKit 安装成功后，把上述 Playwright 命令改为 `--project=webkit`。CDP 触控注入仅针对 Chromium，WebKit 不会冒充该注入结果；真实 iPad 长按、滚动与主屏幕安装还须单列验收。

## 正式服务与 iPad 上线

1. 在自己的 Supabase 测试项目应用 `supabase/migrations`。配置好项目后使用官方 CLI `supabase link`、`supabase db push`；不要把本地测试指向生产数据。
2. 设置前端 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。开启邮箱验证，配置生产邮件服务、实际 HTTPS Site URL 和回调域名，验证注册和恢复邮件。
3. 在 Supabase Edge secrets 设置 `ORS_API_KEY` 和 `ALLOWED_ORIGINS`（逗号分隔完整来源）。URL／anon／service-role 由函数运行环境提供。不要把秘密值粘贴到聊天或源码。
4. 部署 `route-service`。`verify_jwt=false` 因为处理器会自行向 Supabase Auth 校验每个 Bearer token；未经登录或无效输入不消费 ORS 配额。数据库 RPC 只给 service role，每账号每分钟最多20次，外部请求超时15秒、请求最多9个地点。
5. 真实查询莫干山校区的一条步行、一条骑行路线，人工核对建筑、道路、校门开放与耗时。覆盖不足时需调整适配层并重验，不能用直线距离代替。
6. 普通 `npm run build`，将 `dist` 放到 HTTPS 静态托管；SPA 回退到 `index.html`，`sw.js` 和 HTML 需重新验证缓存策略。把来源加入 Auth 回调和 Edge 的允许列表。不要缓存 API。
7. 实际 iPad Safari 登录，分享→添加到主屏幕；验证横竖屏、长按与滚动、离线重开和编辑、联网同步、跨设备冲突、JSON 下载及升级保留修改。建议 iPadOS 17.5 或更新；实际兼容性以真机验收为准。

用户已授权代理选择保存方式，选择推送新分支 `codex/little-days-pink` 并尝试创建 PR；实际结果见 HANDOFF。尚未部署。跨天保存同时另存完整 Git bundle；未推送的本地提交和未发布的草稿不能作为远端备份证据。平台对本地独有提交的快照恢复也需要实际验证。

## 环境裁定记录

- 用户明确选择重建已确认方案，因此复述实施计划后直接继续，不重复请求设计批准；成本是内部实现可能与遗失代码不同，功能验收仍保持原要求。
- 使用现有隔离检出，不新建 worktree；成本是没有额外分支隔离。
- 部分技能辅助资源无法读取，采用主技能要求与本地红／绿灯台账；成本是辅助文档中的额外建议不可用。
- npm／Supabase 缓存放在 `/workspace/.cache`，避免只读 home。VFS 正常分层镜像可能耗尽空间，因此校验官方 crane v0.20.3 与官方 PG17 摘要后制作单层派生镜像，逐项核对上游运行配置，不关闭 TLS／校验。Auth 固定摘要派生镜像只为精确 loopback 健康 URL 的 BusyBox wget 添加 `-Y off`；实际运行用户的执行权限已核对。成本是上游镜像更新时须维护兼容辅助器。Edge v1.77.4 的本地派生镜像另用启动包装器处理 Docker 重复注入的 NO_PROXY，仅为内部 kong 设置例外，外部代理保持原样；该包装器不进入正式函数源码。

ORS 契约来源：官方仓库 `GIScience/openrouteservice` 的 `docs/api-reference/endpoints/matrix/index.md`、`geocoder/index.md` 与 `directions/requests-and-return-types.md`，2026-10-17 重新读取。坐标顺序 `[lon,lat]`，矩阵耗时单位秒，不可达为 null。没有第三方密钥时契约测试不等同真实服务可用。
