/// <reference types="vite/client" />
/// <reference types="unplugin-vue-router/client" />
/// <reference path="./typed-router.d.ts" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
