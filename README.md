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

当前发布版本为 `v0.3.8`，包含以下改进：

- **界面与交互优化**：
  - 将三网延迟/丢包区块整合为单容器双列布局，补充剩余时长临期高亮色与动态流量状态条
  - 修复「内存用量」总览卡图标及移动端字号，优化「剩余价值」浮层为防溢出视口定位（支持点击外部与 `Escape` 关闭）
  - 列表视图同步显示 `v4` / `v6` 标签，卡片与列表均支持三态排序循环（升序 → 降序 → 默认）
  - 修复桌面端搜索框展开遮挡按钮的问题，移动端新增独立全宽搜索行并隐藏滚动条
  - 统一全站为 `tabler:*` 图标与暗色模式高对比度 `emerald` / `sky` 语义色，增强吸顶顶栏背景对比度
  - 修复访客胶囊展开动效与底部页面元素重叠，优化无价格节点详情页实时指标卡与 ECharts Tooltip 对齐及边缘防裁切
- **工程与构建优化**：
  - 拆分本地快照预览与 ZIP 打包为独立 Vite 插件，并在 CI 中校验发布输入
  - 统一使用 Bun 1.4.4 冻结锁文件与只读检查流，本地开发服务器默认绑定 `127.0.0.1`

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
