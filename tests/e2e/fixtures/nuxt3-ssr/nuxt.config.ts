export default defineNuxtConfig({
  ssr: true,
  nitro: {
    preset: 'static',
    prerender: {
      routes: ['/'],
    },
  },
  app: {
    baseURL: './',
  },
  compatibilityDate: '2025-01-01',
});
