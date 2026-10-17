# 启动与接续

工作目录 `/workspace/APP`，开发分支 `work`。先读 `docs/HANDOFF.md`、`docs/RECOVERY.md` 和 `git status --short`／`git log -5 --oneline`。不要把初始 README 或旧会话的测试当成应用已经恢复；不要 reset、覆盖已有配置或删除未提交文件。

1. 依赖或本地后端缺失时运行 `bash scripts/cloud-install.sh`。脚本已经在本次环境完整运行成功。使用 `/workspace/.cache`，不要写入只读 home，不关闭 TLS 校验。
2. 已安装时运行 `npm run backend:start`，再运行 `node scripts/local.mjs`。配置文件不同会明确拒绝覆盖；先检查原因。不要输出 `.env`、原始 `supabase status -o json`、session 或密钥。
3. 运行 `npm run test:integration` 检查真实 API／Auth／RPC 功能，而不只看进程存在。临时测试账号会清理；这不代表正式服务配置已经完成。
4. 启动 `npm run dev -- --mode test --port 5173`。普通首页是实际账号界面；`tests/harness.html` 是明确标记的测试夹具，不能当成正式应用。云环境不支持可分享的 loopback 预览，不向用户提供这种地址。
5. 变更后运行对应测试。完整命令见 README；Chromium 使用系统浏览器，WebKit 仍须另外安装／验证。真实 iPad 与莫干山校区路线不能用浏览器模拟器替代。

本地测试绑定只面向 loopback Supabase。正式前端需真实 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`；地图需在 Supabase Edge 配置 `ORS_API_KEY`、`ALLOWED_ORIGINS`。环境草稿中的要求不等于已经设置值，更不等于 Edge 已注入秘密。不要请求用户把秘密发在聊天里。

暂停前提交代码并更新 HANDOFF；推送、合并、创建 PR、发布服务由用户决定。独立 Git bundle 要另存到用户可保管的位置。本地提交和本地归档都不是远端备份，环境草稿保存也不是发布快照。未经独立恢复测试，不宣称新任务能恢复本地独有提交。
