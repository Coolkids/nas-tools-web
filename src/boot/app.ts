import { defineBoot } from '#q-app'
import { createPinia } from 'pinia'
import 'v-viewer/style.css'

export default defineBoot(({ app }) => {
  app.use(createPinia())
})
