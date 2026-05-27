import { defineHandler } from 'nitro'

export default defineHandler((_event) => {
  return { api: 'works!' }
})
