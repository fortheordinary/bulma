import { createApp, vaporInteropPlugin } from "vue"
import { createRouter, createWebHistory } from "vue-router"
import { routes } from "vue-router/auto-routes"
import App from "./App.vue"
import "./style.css"

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: "smooth" }
    return { top: 0 }
  },
})

createApp(App).use(vaporInteropPlugin).use(router).mount("#app")
