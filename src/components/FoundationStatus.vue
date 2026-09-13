<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <section class="status-card" aria-labelledby="foundation-title">
    <span class="status-badge">Fundação pronta</span>
    <h1 id="foundation-title">{{ title }}</h1>
    <p>{{ description }}</p>
  </section>
</template>

<style scoped>
.status-card {
  display: grid;
  gap: 0.75rem;
}

.status-card h1,
.status-card p {
  margin: 0;
}

.status-card h1 {
  color: var(--color-ink);
  font-size: 1.45rem;
  line-height: 1.15;
}

.status-card p {
  color: var(--color-muted);
  line-height: 1.5;
}

.status-badge {
  width: fit-content;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
