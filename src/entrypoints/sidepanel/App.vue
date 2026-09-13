<script setup lang="ts">
import FoundationStatus from '@/components/FoundationStatus.vue';
</script>

<template>
  <main class="panel-shell">
    <FoundationStatus
      title="Gerenciamento de tarefas"
      description="A estrutura do Side Panel está carregável. O MVP funcional aguarda aprovação dos artefatos OpenSpec."
    />

    <section class="next-step" aria-labelledby="next-step-title">
      <h2 id="next-step-title">Próxima etapa</h2>
      <p>Revisar a Change <code>criar-mvp-gerenciamento-tarefas</code> antes do apply.</p>
    </section>
  </main>
</template>
