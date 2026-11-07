# Dolce Choir 本地使用、分享配置与发布

这是测试版本。四声部制谱、导出、练习及本地真实分享服务已有自动验证；正式 Supabase、GitHub 登录和真实手机尚待验收。实时判唱标为试用，不能据此声称达到通用人声准确率。原项目作者为 lodebar2026，历史与许可保留；合唱扩展仓库为 [Jiyu-666/dolce-choir](https://github.com/Jiyu-666/dolce-choir)。

## 本地运行

使用 Node 22，在仓库根目录执行：

```sh
npm ci
npm run dev
```

打开 `http://localhost:1420/`。仅练习的轻量入口是 `http://localhost:1420/#/practice/demo`；`#/practice/local` 可打开本地 `.dolcepractice` 文件。未配置 Supabase 也能编辑、保存、导出及在本机练习；不会生成虚假分享链接。手机连接电脑的普通 HTTP 局域网地址通常不能使用麦克风，手机录音验收需 HTTPS 正式/测试地址。

1. 导入 MusicXML，或先用原有识谱功能校对五线谱。打开工具栏“合唱设置”。原谱是唯一编辑来源。
2. 为 S 女高、A 女低、T 男高、B 男低选择 part/staff/voice，试听并确认。双音和弦需要逐音分配；交叉声部、同度重复使用及不明记号必须人工解决，不能靠勾选确认绕过问题。遇到数字速度冲突时，面板会列出声部和四分音符 BPM；明确选定后可统一该拍位的原谱速度，并用原谱撤销恢复，受影响声部需重新确认。无法解释的反复/跳转会阻止生成评分目标。
3. 生成四声部混排预览；分别调整五线谱高度 mm、简谱字号 pt、层间与组间净距 mm，导出同版 PDF/PNG。保存 `.dolcechoir` 保留原谱、映射、版式与练习默认设置；原图只可附在本地编辑工程，不进入分享包。
4. “导出四声部钢琴 MP3＋MIDI（ZIP）”生成四份钢琴独奏 MP3 和四份 MIDI。全曲原速、无预备拍/节拍器；ZIP 内有音源署名。生成中可以取消，修改原谱会使旧任务失效。
5. 选择声部及片段练习，默认给起音、一小节预备拍后清唱。钢琴跟唱、持续节拍器独立且默认关闭。允许麦克风后先安静约一秒；音准和覆盖率分别显示。“未听清”不等于漏唱；覆盖不足 50% 不给整段音准结论。可显式选择升/降一个八度，页面和参考音同步变化。
6. 保存轻量练习包 `.dolcepractice`，可在本地轻量入口打开；维护者配置云项目后才可发布匿名链接。暂停/切后台后从当前小节重新预备；切声部、速度或片段会开始新尝试。成绩仅在当前会话保留，不上传人声或成绩。

自制 CC0 四小节示例在 `public/choir/`，包含四声部与曲中变速。`npm run example:choir` 重建示例及 `out/choir-example/demo.dolcechoir`。示例不是识谱准确性的证明。

## 自动检查

```sh
npm run typecheck
npm test
npm run test:build-config
npm run build
npx playwright install chromium
npm run test:browser
BASE_PATH=/dolce-choir/ npm run build
npm run test:pages
npm run check:share
npm run build:share
```

`test:pages` 必须读取上一步子路径构建，检查无隔离环境的分析 Worker、字体、WASM、钢琴、英文/刷新路由及真实 ZIP/PDF/PNG 下载。`test:browser` 会启动 1420，`test:pages` 使用 1422，运行时请避免占用端口。旧私有语料测试保留为 `test:upstream`，不作为公开仓库门槛。

本地分享检查使用真实 Supabase Postgres/Auth/Storage/Functions，不需要云账户。当前固定 CLI 3.0.0，原生运行时为实验能力，Linux 和 Apple Silicon macOS 可用；其他环境采用官方支持的 Docker 运行时。版本和服务制品锁文件均已提交。[官方运行时说明](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)。

```sh
mkdir -p out
export SUPABASE_HOME="$PWD/out/supabase-home"
export DENO_DIR="$PWD/out/deno-cache"
npm run build:share
npx supabase start --runtime native --exclude studio,mail,analytics,realtime,pooler --preparation on-demand --eager > out/supabase-start.log 2>&1
npx supabase status --output-format json > out/supabase-status.json
npm run test:share
npx supabase stop
```

只对隔离的本地项目运行 `test:share`：测试会临时创建用户、可信 GitHub 身份记录、分享及对象，并恢复/清理。`out/supabase-status.json` 含本地凭据，不可提交或作为 CI 公开制品。测试中直接设置 Auth 身份用于验证服务端权限；真实 GitHub OAuth 需要单独验收。

函数入口 `supabase/functions/choir-api/index.ts` 是自包含生成文件；修改 `source.ts` 或共享模块后运行 `build:share`。`check:share` 严格检查原始 TypeScript；不把生成的 JavaScript 当手写 TypeScript 再检查。没有运行时公共 CDN 导入。

## 配置免费的 Supabase 项目

目前未创建生产项目。以下是后续操作说明，不表示已部署。不要启用付费计划；先查看项目配额和免费项目状态。

1. 创建独立免费项目。在项目设置读取项目 URL 和 **publishable key**（旧项目可用 anon key），将 `.env.example` 复制为 `.env.local` 后填写这两个公开值。不能将 service-role/secret 密钥放入任何 `VITE_` 变量；构建会拒绝它们。
2. 配置 GitHub OAuth App。GitHub 的授权回调是 Supabase 提供的 `https://<project-ref>.supabase.co/auth/v1/callback`，不是 Pages 页面。Client Secret 仅填在 Supabase GitHub provider 设置中。建议本地与生产分别创建 OAuth App；本地 callback 以 `supabase status` 的 API URL 加 `/auth/v1/callback` 为准。[官方 GitHub 登录指南](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)。
3. Supabase Auth URL Configuration 的 Site URL 使用 `https://jiyu-666.github.io/dolce-choir/`；允许重定向 `https://jiyu-666.github.io/dolce-choir/?choirAuth=1`。本地项目允许 `http://localhost:1420/?choirAuth=1`、`http://127.0.0.1:1420/?choirAuth=1`。不要给无关域名通配授权。
4. CLI 登录并关联**新建的本项目**，先预览迁移，再应用和部署。CLI 3 的数据库远端操作要显式 `--remote`；不要用旧版命令推测默认目标。只应用新增迁移，不清空现有数据。

```sh
export SUPABASE_HOME="$PWD/out/supabase-home"
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote --dry-run
npx supabase db push --remote
npm run check:share
npm run build:share
npx supabase functions deploy choir-api --use-api --no-verify-jwt
```

函数允许匿名解析，所以网关 JWT 检查关闭；创建/列出/撤销在函数中用 `auth.getUser` 重新验证身份和所有者。维护者固定为可信 GitHub provider ID **138117377**；客户端角色字段和可修改昵称无效。函数运行时的服务端密钥由 Supabase 提供，不写入前端。

5. 复制 `supabase/.env.example` 为忽略的 `supabase/.env.local`；设置 `CHOIR_ALLOWED_ORIGINS` 为 `https://jiyu-666.github.io`（仅 origin，没有路径）；多个受信任环境逗号分隔。然后 `npx supabase secrets set --env-file supabase/.env.local`。与正式 OAuth 分开，本地默认只允许 1420 的 localhost/127.0.0.1。
6. 验证私有桶 `choir-practice-v1`、RLS、发布、列表、撤销、匿名有效读取/无效拒绝。实际 GitHub 登录需验证上述数字 ID。不要将浏览器 key 提升为 Storage 列举权限。

分享是不可变快照：改谱后发布新链接。随机令牌在 URL fragment，通过 POST 交给函数；数据库只存哈希，每次解析检查撤销并返回 `no-store`。链接接收者可保存文件，撤销不能回收已经下载或已载入的内容。应用不会将人声或成绩传给服务。

## Pages 发布与回滚

生产配置完成后，在仓库 Settings → Pages 选择 GitHub Actions；Actions Variables 设置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。工作流需先位于默认分支，才会出现在手动触发列表。只在已审阅分支通过检查后合并。

`Choir checks` 对 PR 和工作分支执行前端检查及独立真实本地后端集成；`Choir Pages` 只手动触发，填写已审阅的完整 commit/tag，构建 `BASE_PATH=/dolce-choir/` 并再次检查子目录功能。缺少分享配置会在上传前失败。继承的桌面 Release/旧 Pages 自动工作流仅在上游仓库运行，不会因本 Fork 发布触发桌面打包。[GitHub 官方 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

发布后读取 `/dolce-choir/build-info.json`，核对完整提交、版本、dirty=false 和 basePath。实际发布自制曲，匿名手机访问、录音、下载、撤销全部成功后才记录端到端通过。

回滚：重新手动运行 `Choir Pages`，ref 指向前一已通过的完整提交/tag；核对 build-info 和旧分享仍可读。不要删除数据库分享或反向破坏性迁移。PracticePackageV1 读取器是兼容契约，未来增加版本必须保留旧版读取或先迁移；先部署兼容的新增数据库/函数，再部署使用它的前端。权限修复不能用前端回滚替代。

## 当前限制

- 没有正式 Supabase/OAuth/Pages 发布；不能提供有效的生产分享演示链接。
- 尚无实体 iPhone/安卓及独立真实人声验收。桌面合成输入不替代手机许可、回声、延迟、十分钟稳定性与听感；详见 [DEVICE-ACCEPTANCE.md](DEVICE-ACCEPTANCE.md)。
- 强二次谐波可能产生八度误判，已记录且不根据谱音折回正确八度。默认清唱是验收路径，外放钢琴与人声混合不承诺可靠判唱。节奏校准的真实声学路径尚未验证。
- 不猜测非数值 rit./rubato/延长号时长；按名义时值练习。无法解释的跳转、重复次数不为 2、冲突控制记号会拒绝生成目标；需要修正原谱。冲突数值速度可在合唱面板中明确选择权威值并更新 MusicXML 原谱；其他源格式仍在原编辑器校正。
- 原有 OMR 没有重写；需人工校对识别结果。真实旧 `.dolce` 原图校对的端到端回归、实体打印和更广乐谱语料仍待补充。
- 音频分块边界/十分钟长度已经桌面解码验证，手机峰值内存尚未测量。取消会终止编码和后续区块，已在浏览器内部渲染的当前区块结束后丢弃。

依赖及音源来源见 [DEPENDENCIES.md](DEPENDENCIES.md)，可执行证据见 [ACCEPTANCE.md](ACCEPTANCE.md)，剩余任务见 [STATUS.md](STATUS.md)。
