<template>
  <div id="app-container">
    <header class="app-header">
      <h1>{{ title }}</h1>
      <p class="subtitle">{{ subtitle }}</p>
    </header>

    <main class="app-content">
      <section class="card">
        <h2>Dashboard Overview</h2>
        <p>This Vue 3 SPA fixture contains multiple components with realistic DOM structure to test web-clone SPA crawling capabilities.</p>
        <div class="stats-grid">
          <div class="stat-item" v-for="stat in stats" :key="stat.label">
            <span class="stat-value">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>{{ featuresTitle }}</h2>
        <ul class="feature-list">
          <li v-for="(feature, index) in features" :key="index">
            <span class="feature-icon">&#10003;</span>
            {{ feature }}
          </li>
        </ul>
      </section>

      <section class="card image-section">
        <h2>Resources</h2>
        <div class="image-grid">
          <img
            v-for="i in 3"
            :key="i"
            :src="`/assets/placeholder-${i}.svg`"
            :alt="`Placeholder ${i}`"
            class="placeholder-img"
          />
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <p>&copy; {{ year }} Vue 3 E2E Fixture. This page is designed to test web-clone SPA snapshot capabilities.</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const title = ref('Vue 3 SPA Application');
const subtitle = ref('End-to-End Test Fixture for Web-Clone');

const year = computed(() => new Date().getFullYear());

const featuresTitle = ref('Key Features');

const stats = ref([
  { label: 'Components', value: '5' },
  { label: 'Elements', value: '30+' },
  { label: 'Images', value: '3' },
  { label: 'Sections', value: '3' },
]);

const features = ref([
  'Server-side framework detection via __VUE__ global',
  'Client-side hydration with reactive data binding',
  'CSS styling with external stylesheet',
  'Image resources for sub-resource download testing',
  'Multiple component sections with varied DOM structure',
]);
</script>
