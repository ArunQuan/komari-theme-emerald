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

当前发布版本为 `v0.3.2`，包含以下改进：

- 节点卡片优化字体层级、留白和紧凑布局
- 调整节点标题与资源利用率字号，让卡片信息层级更协调
- 实时速率与累计流量根据数值长度紧凑显示，悬停可查看完整数值
- 在节点卡片中显示剩余时长和按剩余周期估算的金额
- 电信、联通、移动分别对应各自的 Ping 延迟与丢包数据，并展示历史趋势

本仓库只包含主题源代码和可导入的主题构建包，不包含探针数据库、账号信息、服务器配置或访问凭据。

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `>=1.2.0`

## 开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 代码检查
bun run lint
```

## 构建

```bash
# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

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
