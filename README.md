# NAStool Web

基于 **Vue 3 + Quasar + Quasar CLI (Vite) + TypeScript** 的 NAStool 前端界面。

> NAStool 的前后端分离前端，需配合 [nas-tools](https://github.com/Coolkids/nas-tools) 后端使用。

## 技术栈

| 能力 | 选型 |
|------|------|
| 框架 | Vue 3 (`<script setup lang="ts">`) |
| 构建 | Quasar CLI with Vite |
| UI | Quasar 2 |
| 路由 | Vue Router 4 |
| 状态 | Pinia |
| HTTP | Axios |
| 类型 | TypeScript 5 + vue-tsc |

## 架构

```
浏览器 ──→ nginx:80 (生产) / Vite:5173 (开发)
              │  静态资源：nas-tools-web/dist
              │  反向代理 /do /login_json /api/v1 ... →
              └──→ Flask:3000 (nas-tools 后端)
```

- **开发模式**：Vite dev server 自带反向代理，把后端接口转发到 Flask :3000，同源请求，无 CORS 问题。
- **生产模式**：nginx 托管 `dist` 静态文件，反向代理 API 到 Flask（见 `nginx.conf`）。

## 目录结构

```
nas-tools-web/
├── index.html                # Vite 入口
├── quasar.config.ts         # Quasar CLI + Vite 配置、开发反向代理
├── nginx.conf                # 生产 nginx 配置示例
├── .env.development          # 开发环境变量
├── .env.production           # 生产环境变量
├── src/
│   ├── boot/app.ts           # Pinia、Viewer 初始化
│   ├── App.vue               # 根据 route.meta.public 切换登录页/主布局
│   ├── router/index.ts       # 全部路由 + 登录守卫
│   ├── api/                  # Axios 封装 + 各业务 API 模块
│   │   ├── request.ts        # doAction()，未登录跳 /login
│   │   ├── auth.ts           # login / logout / checkAuth
│   │   ├── config.ts / site.ts / rss.ts / download.ts
│   │   ├── rename.ts / discovery.ts / media.ts / system.ts / brush.ts
│   ├── stores/               # Pinia（app / modal）
│   ├── components/           # 通用组件（MediaCard/PersonCard/PageHeader...）
│   ├── composables/          # useConfigForm 等
│   ├── layouts/DefaultLayout.vue
│   └── views/                # 40+ 个页面
└── dist/                     # 构建产物（git 忽略）
```

## 开发流程

### 1. 启动后端 Flask

在 [nas-tools](https://github.com/Coolkids/nas-tools) 项目根目录：

```bash
export NASTOOL_CONFIG=./config/config.yaml
.venv/bin/python run.py
# Flask 监听 :3000
```

### 2. 启动前端 Dev Server

```bash
pnpm install     # 首次
pnpm dev         # Quasar dev :5174，自动反向代理 API 到 :3000
```

打开 `http://localhost:5174/`，自动跳转到 Vue 登录页（admin / password）。

### 3. 登录流程

- 表单提交到 `/login_json`（经 Vite 代理同源请求）。
- 登录成功后设置 Flask session cookie，后续 `/do` 请求自动带 cookie。
- 未登录时路由守卫拦截，重定向到 `/login?redirect=原路径`。

## 生产部署

### 1. 构建前端

```bash
pnpm install
pnpm build      # 产物输出到 dist/
```

### 2. 配置 nginx

```bash
cp nginx.conf /etc/nginx/conf.d/nastool-web.conf
vim /etc/nginx/conf.d/nastool-web.conf
# 主要改：server_name、root 指向 <项目路径>/dist

nginx -t && nginx -s reload
```

nginx 会：
- 托管 `dist` 静态文件（`/assets/` 长缓存）
- 反向代理 `/do` `/login_json` `/api/v1` `/img` 等到 Flask :3000
- SPA history 模式回退（`try_files $uri /index.html`）

### 3. 访问

浏览器打开 `http://<服务器IP>/`，进入 Vue 登录页。

## 构建产物

| 产物 | 大小（gzip） |
|------|------|
| 主 chunk（Vue+EP+Pinia+Router） | ~410 KB |
| 各页面 chunk | 1-23 KB（按需懒加载） |

## 相关项目

- [nas-tools](https://github.com/Coolkids/nas-tools) — NAStool Python 后端


## 媒体识别设置验收

`/basic?tab=ai` 的五组设置与缓存页、服务清理编辑器共用后端配置版本。单元测试使用 Vitest/Vue Test Utils；E2E 使用 Playwright 桌面和手机 Chromium，自动启动隔离 Flask 与 Quasar，不复用开发服务。

测试源为相邻后端 `nas-tools/tests/config/recognition.yaml`。从后端根目录执行 `.venv/bin/python tests/tools/generate_recognition_frontend_fixture.py` 更新本仓快照；runner 校验源哈希，禁止静默沿用过期快照。后端项目虚拟环境必须已安装项目测试依赖。

```bash
npm ci
npx playwright install chromium --only-shell
npm run type-check
npm run build
npm run test:unit
npm run test:e2e
```

每次报告保存在 `.test-runtime/recognition-v3/{unit|e2e}-<UTC>-<id>/`，含环境摘要、JUnit、日志与退出码，E2E另有HTML和截图。假密钥只用于回环假模型，HTTP trace关闭；测试不会访问付费模型。不要公开运行数据库/密钥文件。S22–S24当前65项unit、38项桌面/手机E2E通过，包含22项记录/流程/回放/实时恢复/非空清理场景。后续完整存储与目标环境发布验收留S25。完整交付记录见后端 `docs/NAS-Tools_媒体识别_V3_S24_实施与验收.md`。


记录页保留 `/recognition` 和 `/ai_recognition` 重定向，详情可通过 `?request_id=<id>` 直接打开。流程图使用 Vue Flow 1.48.2；实时与历史回放共用事件 reducer，未留存和已清理不伪造空历史。开发代理与生产 Nginx 均需转发原 JSONL/Excel 导出地址。

`npm run test:e2e -- tests/e2e/history.spec.ts` 可单独运行S24。启动器只在私有测试服务安装 `_test/history`、`_test/release` 和 `_test/collect`；生产应用不会注册这些fixture路由。样本和受控runner仍使用真实Flask会话、Trace/仓储/清理和SSE，不访问外网服务。
