import { defineBoot } from '#q-app'
import { createPinia } from 'pinia'
import VxeUITable from 'vxe-table'
import VueViewer from 'v-viewer'

export default defineBoot(({ app }) => {
  app.use(createPinia())
  app.use(VueViewer)
  app.use(VxeUITable)
})
