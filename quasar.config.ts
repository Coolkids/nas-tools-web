import { defineConfig } from '#q-app'

// 开发时后端 Flask 地址（run.py 默认 3000 端口）
const FLASK_TARGET = process.env.FLASK_TARGET || 'http://localhost:3000'

export default defineConfig(() => ({
  css: [
    '../styles/index.scss',
    '~viewerjs/dist/viewer.css',
    '~vxe-table/lib/style.css'
  ],

  extras: ['material-icons'],

  framework: {
    lang: 'zh-CN',
    iconSet: 'material-icons',
    plugins: ['Dialog', 'Notify'],
    config: {
      brand: {
        primary: '#315BD6',
        positive: '#187348',
        negative: '#BE303A',
        warning: '#8A5700',
        info: '#176B9A'
      }
    }
  },

  boot: ['app'],

  devServer: {
    host: '0.0.0.0',
    port: 5174,
    // 开发期把后端接口代理到 Flask，同源请求，cookie 跨端口共享（浏览器 cookie 不区分端口）
    proxy: {
      '/do': {
        target: FLASK_TARGET,
        changeOrigin: true,
        bypass: (req) => req.url?.split('?')[0] !== '/do' ? req.url : undefined
      },
      '/login_json': { target: FLASK_TARGET, changeOrigin: true },
      '/logout_json': { target: FLASK_TARGET, changeOrigin: true },
      '/dirlist': { target: FLASK_TARGET, changeOrigin: true },
      '/api/v1': { target: FLASK_TARGET, changeOrigin: true },
      '/img': { target: FLASK_TARGET, changeOrigin: true },
      '/backup': { target: FLASK_TARGET, changeOrigin: true },
      '/upload': { target: FLASK_TARGET, changeOrigin: true },
      '/rss_import_upload': { target: FLASK_TARGET, changeOrigin: true },
      '/rss_import_template': { target: FLASK_TARGET, changeOrigin: true },
      '/rss_import_errors': { target: FLASK_TARGET, changeOrigin: true },
      '/wechat': { target: FLASK_TARGET, changeOrigin: true },
      '/plex': { target: FLASK_TARGET, changeOrigin: true },
      '/jellyfin': { target: FLASK_TARGET, changeOrigin: true },
      '/emby': { target: FLASK_TARGET, changeOrigin: true },
      '/telegram': { target: FLASK_TARGET, changeOrigin: true },
      '/subscribe': { target: FLASK_TARGET, changeOrigin: true },
      '/wallpaper': { target: FLASK_TARGET, changeOrigin: true }
    }
  },

  build: {
    publicPath: '/',
    vueRouterMode: 'history',
    distDir: 'dist',
    sourcemap: false,
    extendViteConf: () => ({
      css: {
        preprocessorOptions: {
          scss: { api: 'modern-compiler' }
        }
      },
      build: {
        chunkSizeWarningLimit: 1500
      }
    })
  }
}))
