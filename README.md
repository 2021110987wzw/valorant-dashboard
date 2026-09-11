# 无畏契约 · 折扣看板

一个纯静态的无畏契约（VALORANT）皮肤折扣看板：首页实时展示**当前商店轮换礼包**与**夜市活动**，内置**皮肤图鉴**（点击卡片查看特效/动画视频预览），数据**每日自动更新**，无需任何后端服务。

## 功能

- 🔥 **当前礼包轮换**：每日更新脚本解析 valohub 商店快照，展示正在轮换的礼包、含皮肤明细、原价/折后价与折扣
- 🌙 **夜市活动**：基于官方历史公告锚点推算排期（进行中 / 下次开启倒计时），并内置「模拟我的夜市」——按 2026 官方规则随机生成 6 款折扣皮肤（品质范围、同武器上限、至少 2 款高级、折扣 10%~49%）
- 🗂 **皮肤图鉴**：1,300+ 款皮肤，支持按武器类型 / 品质 / 系列 / 关键词筛选；点击皮肤卡片弹出详情，可切换等级查看**特效动画视频**（检视、枪口特效、终结特效）与全部配色
- 💎 **礼包价格估算**：按官方品质定价规则（精选 875 / 奢华 1275 / 高级 1775 / 限定 2175·2675 / 尊爵 2475 VP 等）估算单买总价与礼包价（"刀免费"惯例）
- ⏰ **每日更新**：`scripts/update.mjs` 无依赖抓取全部数据，可注册 Windows 计划任务每日自动执行

## 发布到公网（给朋友看）

**临时链接（免账号，立即可用）**：本机自带 OpenSSH，一条命令把本地站点映射到公网：

```powershell
node scripts/server.mjs                                    # 1. 先启动本地服务
ssh -R 80:127.0.0.1:8347 nokey@localhost.run               # 2. 建立隧道
# 终端会打印一个 https://xxxx.lhr.life 地址，直接发给朋友即可
```

> 注意：链接只在隧道运行期间有效（电脑需保持开机，勿休眠）；每次重启隧道地址会变；免费会话有连接时长限制，断开后重新执行命令即可。

**永久部署（需要账号，任选其一）**：

- [Netlify Drop](https://app.netlify.com/drop)：注册后把整个项目文件夹拖入网页即可发布，最简单
- GitHub Pages：把文件夹推到 GitHub 仓库 → Settings → Pages 选择分支，即可获得 `用户名.github.io` 地址
- 部署后若要让数据保持更新：把 `scripts/update.mjs` 也放进仓库，配合 GitHub Actions 每日执行，或本地更新后重新拖拽发布

## 快速开始

```powershell
# 1. 更新数据（首次或手动刷新时执行，需要 Node.js ≥ 18）
node scripts/update.mjs

# 2. 启动本地预览
node scripts/server.mjs
# 打开 http://127.0.0.1:8347
```

> 也可以直接用任意静态服务器托管整个目录（如 VS Code Live Server、`python -m http.server`），或部署到 GitHub Pages / Nginx 等。

## 每日自动更新

方式一（推荐，Windows 计划任务，使用 PowerShell ScheduledTasks 模块，已在本机注册）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\schedule.ps1   # 注册：每天 08:30 自动更新
Get-ScheduledTaskInfo -TaskName ValorantDashboardDailyUpdate    # 查看下次运行时间
Start-ScheduledTask  -TaskName ValorantDashboardDailyUpdate     # 手动立即运行一次
Unregister-ScheduledTask -TaskName ValorantDashboardDailyUpdate -Confirm:$false  # 删除
# 或使用 schtasks：schtasks /Delete /TN ValorantDashboardDailyUpdate /F
```

方式二：`Win + R` → `taskschd.msc` → 创建基本任务 → 每日 → 程序 `node`、参数 `C:\...\valorant-dashboard\scripts\update.mjs`。

方式三（Linux/macOS cron）：`30 8 * * * cd /path/to/valorant-dashboard && node scripts/update.mjs`

## 目录结构

```
valorant-dashboard/
├── index.html            看板页面（首页 + 皮肤图鉴，Hash 路由）
├── css/style.css         样式
├── js/
│   ├── shared.js         数据加载、工具函数、皮肤详情弹窗（特效视频播放）
│   ├── home.js           首页：轮换礼包 / 夜市 / 精选与全部礼包
│   ├── gallery.js        皮肤图鉴：筛选与网格
│   └── app.js            路由与初始化
├── data/                 每日更新生成的数据（自动生成，勿手改）
│   ├── skins.json        皮肤图鉴目录（含各级特效视频 URL）
│   ├── bundles.json      礼包目录（内容重建 + 价格估算）
│   ├── storefront.json   当前商店轮换快照
│   ├── nightmarket.json  夜市排期 + 资格池
│   └── meta.json         更新时间 / 游戏版本 / 统计
└── scripts/
    ├── update.mjs        每日数据更新（零依赖）
    ├── server.mjs        本地静态服务器
    ├── schedule.ps1      注册 Windows 每日更新计划任务
    └── smoke-test.mjs    冒烟测试（需临时安装 jsdom，可选）
```

## 数据来源与说明

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 皮肤目录 / 品质 / 主题 / 特效视频 | [valorant-api.com](https://valorant-api.com)（官方客户端数据快照） | 皮肤与礼包为公开目录 |
| 当前商店轮换礼包 | [valohub.co/store](https://valohub.co/store)（公开页面解析） | 每日脚本尽力解析；失败时自动回退「近期礼包精选」 |
| 夜市排期 | 官方公告历史锚点 + 间隔推算 | 未来场次为**推算值**，仅供参考 |
| 个人夜市内容 | —— | 公开接口无法获取（需玩家授权），看板内置**随机模拟器**代替 |
| 价格 | 官方品质定价规则 | 礼包价为估算；实时礼包按快照折扣计算 |

**免责声明**：本站为社区向非官方工具，与 Riot Games 无关联；VALORANT 及相关素材版权归 Riot Games 所有。皮肤中文系列名为参考译名，以游戏内为准。

## 自定义

- `scripts/update.mjs` 中可编辑：
  - `FEATURED_ORDER` —— 「近期礼包精选」的排序（新 → 旧），新版本礼包发布后按名称插入最前即可
  - `NM_ANCHORS` —— 夜市真实日期锚点（每次官方公布后追加一条，推算会更准）
  - `THEME_ZH` —— 系列中文译名表
- 皮肤卡片默认按品质排序，图鉴页支持搜索与筛选
