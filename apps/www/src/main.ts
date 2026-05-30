import { createApp, vaporInteropPlugin } from "vue"
import { createRouter, createWebHistory } from "vue-router"
import App from "./App.vue"
import Home from "./pages/Home.vue"
import CliLogin from "./pages/CliLogin.vue"
import "./style.css"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/cli", component: CliLogin },
  ],
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: "smooth" }
    return { top: 0 }
  },
})

createApp(App).use(vaporInteropPlugin).use(router).mount("#app")
