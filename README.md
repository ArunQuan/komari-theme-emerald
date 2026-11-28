<h3 align="center"> Komari Emerald Compact </h3>
<p align="center">
基于 Vue 3 + Vite + reka-ui + Tailwind CSS v4 构建的 Komari Monitor 主题
<br>
ArunQuan 维护的 Komari Emerald 紧凑版主题
</p>

![preview](/docs/preview.png)

## 使用

1. 从 [Release 页面](https://github.com/ArunQuan/komari-theme-emerald/releases) 下载最新的 `komari-theme-emerald-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

## 当前版本

当前发布版本为 `v0.3.12`，包含以下改进：

- **3D 地球动态飞线与离线告警**：
  - 升级 3D 地球连接线为精准贴合球面投影与地平线遮挡的动态轨迹，每条活跃线路按实时网络速率以平缓流畅节奏发射单条渐变彗星飞线与抵达终点波纹
  - 暗色模式采用冰青蓝至纯白流光，亮色模式采用祖母绿（Emerald）渐变拖尾与轨迹轨道，贴合主题视觉
  - 全离线地区以红色呼吸脉冲告警（无飞线），部分离线地区以红色轨迹与红白飞线提示，低性能档位自动回退为静态 WebGL 弧线
- **多屏幕自适应宽屏与交互升级**：
  - 将主容器、顶栏与页脚升级为自适应流式宽度（默认 `wide` 上限 `1920px`，1080p 可排 5 列、2K 可排 6 列，保持单卡黄金宽度不拉宽），支持 `wide` / `full`（`96vw`）/ `standard`（`1280px`）
  - 后台主题配置新增「页面宽度模式（`pageWidthMode`）」，首页桌面端工具栏新增三态页面宽度一键切换按钮
  - 优化大屏下总览卡与 3D 地球栅格比例（`7:5` 与 `460px` 地球），详情页信息卡在 `2xl` 超宽屏单行 4 列排布，负载图表高度同步协调
- **界面、卡片与工程化优化（含 `v0.3.8`）**：
  - 将三网延迟/丢包区块整合为单容器双列布局，补充剩余时长临期高亮色与动态流量状态条
  - 修复「内存用量」总览卡图标及移动端字号，优化「剩余价值」浮层为防溢出视口定位（支持点击外部与 `Escape` 关闭）
  - 列表视图同步显示 `v4` / `v6` 标签，卡片与列表均支持三态排序循环（升序 → 降序 → 默认），桌面搜索不遮挡按钮且移动端提供独立搜索行
  - 统一全站为 `tabler:*` 图标、暗色模式高对比度语义色与吸顶顶栏背景，优化无价格节点详情页实时指标卡、ECharts Tooltip 对齐与移动端页脚避让

本仓库只包含主题源代码和可导入的主题构建包，不包含探针数据库、账号信息、服务器配置或访问凭据。

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `1.4.4`（与 `packageManager` 及 CI 一致）

## 开发

```bash
# 安装依赖
bun install --frozen-lockfile

# 启动开发服务器
bun run dev

# 只读代码检查
bun run lint:check
```

## 构建

```bash
# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

## 构建与依赖约定

- `bun.lock` 必须提交；日常安装使用冻结锁文件，更新依赖后同步提交清单和锁文件。
- `bun run check` 执行 lint、类型检查和构建；`bun run lint` 用于主动修复格式。
- Vite 入口在 `vite.config.ts`，本地快照 API 和 ZIP 插件在 `build/`。快照文件不存在时仍可构建生产包。
- 开发服务器默认仅监听 `127.0.0.1`；需要局域网访问时显式运行 `bun run dev --host 0.0.0.0`。
- ZIP 保持 `komari-theme-emerald-build-<sha>.zip` 命名，必须包含 `dist/`、`komari-theme.json`、`preview.png`；输入缺失会使构建失败。
- 构建工具链暂时定向覆盖 glob、minimatch 7–10、tinypool 的修复版本，避免覆盖仍使用旧 API 的 minimatch 3/5。依据：[Minimatch 公告](https://github.com/advisories/GHSA-g3hv-75wg-m249)、[Glob 公告](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)、[Tinypool 公告](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)。升级上游后重新运行 `bun audit` 和 `bun run check`，确认可移除覆盖时再删除。
- 普通提交和 PR 运行 Build CI；master 版本变化才发布。源码优化本身不自动增加发布版本。

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Vue 3                            |
| 构建工具 | Vite 7                           |
| UI 组件  | reka-ui（shadcn-vue 风格组件）   |
| 样式方案 | Tailwind CSS v4 + tw-animate-css |
| 状态管理 | Pinia 3                          |
| 路由     | Vue Router 5                     |
| 提示系统 | vue-sonner（Toaster）            |
| 图标     | @iconify/vue                     |
| 图表     | vue-echarts                      |
| 3D 地球  | cobe                             |
| 实用工具 | @vueuse/core, dayjs              |
| 代码规范 | ESLint (@antfu/eslint-config)    |

## 鸣谢

- [Komari](https://github.com/komari-monitor/komari)
- [原始 Komari Emerald 主题](https://github.com/R1ddle1337/komari-theme-emerald)
- [Komari Naive](https://github.com/tonyliuzj/komari-naive)
- [Vue 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [reka-ui](https://reka-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

本主题基座基于 [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)，特此感谢

## License

[MIT](./LICENSE)
