import { createApp } from './app'
import { env } from './config/env'
import { MODEL_NAME, PRODUCT_NAME } from './constants'

const app = createApp()

app.listen(env.PORT, () => {
  console.log(`${PRODUCT_NAME} (${MODEL_NAME}) listening on http://localhost:${env.PORT}`)
  console.log(`Environment: ${env.NODE_ENV}`)
})
