<script setup lang="ts">
import { useId } from 'vue';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/domain/task';
import type { DueSituation, TaskFilters, TaskSortKey } from '@/domain/task-queries';
import { DUE_SITUATION_LABELS, PRIORITY_LABELS, SORT_LABELS, STATUS_LABELS } from './task-labels';

defineProps<{
  filters: TaskFilters;
  sortKey: TaskSortKey;
  hasActiveFilters: boolean;
}>();

const emit = defineEmits<{
  'update:filters': [changes: Partial<TaskFilters>];
  'update:sortKey': [sortKey: TaskSortKey];
  clear: [];
}>();

const id = useId();
const dueSituations = Object.keys(DUE_SITUATION_LABELS) as DueSituation[];
const sortKeys = Object.keys(SORT_LABELS) as TaskSortKey[];

function valueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
</script>

<template>
  <section class="filters" :aria-labelledby="`${id}-heading`">
    <h2 :id="`${id}-heading`" class="visually-hidden">Pesquisa, filtros e ordenação</h2>

    <div class="field search">
      <label :for="`${id}-search`">Pesquisar</label>
      <input
        :id="`${id}-search`"
        type="search"
        :value="filters.search"
        placeholder="Título, descrição, pessoas ou tags"
        @input="emit('update:filters', { search: valueOf($event) })"
      />
    </div>

    <div class="filter-grid">
      <div class="field">
        <label :for="`${id}-status`">Status</label>
        <select
          :id="`${id}-status`"
          :value="filters.status"
          @change="emit('update:filters', { status: valueOf($event) as TaskFilters['status'] })"
        >
          <option value="ALL">Todos</option>
          <option v-for="status in TASK_STATUSES" :key="status" :value="status">
            {{ STATUS_LABELS[status] }}
          </option>
        </select>
      </div>

      <div class="field">
        <label :for="`${id}-priority`">Prioridade</label>
        <select
          :id="`${id}-priority`"
          :value="filters.priority"
          @change="emit('update:filters', { priority: valueOf($event) as TaskFilters['priority'] })"
        >
          <option value="ALL">Todas</option>
          <option v-for="priority in TASK_PRIORITIES" :key="priority" :value="priority">
            {{ PRIORITY_LABELS[priority] }}
          </option>
        </select>
      </div>

      <div class="field">
        <label :for="`${id}-due`">Prazo</label>
        <select
          :id="`${id}-due`"
          :value="filters.dueSituation"
          @change="
            emit('update:filters', {
              dueSituation: valueOf($event) as TaskFilters['dueSituation'],
            })
          "
        >
          <option value="ALL">Todos</option>
          <option v-for="situation in dueSituations" :key="situation" :value="situation">
            {{ DUE_SITUATION_LABELS[situation] }}
          </option>
        </select>
      </div>

      <div class="field">
        <label :for="`${id}-sort`">Ordenar por</label>
        <select
          :id="`${id}-sort`"
          :value="sortKey"
          @change="emit('update:sortKey', valueOf($event) as TaskSortKey)"
        >
          <option v-for="key in sortKeys" :key="key" :value="key">{{ SORT_LABELS[key] }}</option>
        </select>
      </div>
    </div>

    <button
      type="button"
      class="button-small button-secondary clear"
      :disabled="!hasActiveFilters"
      @click="emit('clear')"
    >
      Limpar filtros
    </button>
  </section>
</template>

<style scoped>
.filters {
  display: grid;
  gap: 0.7rem;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.6rem;
}

.clear {
  justify-self: start;
}
</style>
