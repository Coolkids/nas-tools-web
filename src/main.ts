import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Dialog, Notify, Quasar } from 'quasar'
import quasarLang from 'quasar/lang/zh-CN'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import 'viewerjs/dist/viewer.css'
import VxeUITable from 'vxe-table'
import 'vxe-table/lib/style.css'
import VueViewer from 'v-viewer'

import App from './App.vue'
import router from './router'
import './styles/index.scss'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(VueViewer)
app.use(Quasar, {
  plugins: { Dialog, Notify },
  lang: quasarLang,
  config: {
    brand: {
      primary: '#315BD6',
      positive: '#187348',
      negative: '#BE303A',
      warning: '#8A5700',
      info: '#176B9A'
    }
  }
})
app.use(VxeUITable)
app.mount('#app')
