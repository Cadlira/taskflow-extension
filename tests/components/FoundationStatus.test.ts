import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FoundationStatus from '@/components/FoundationStatus.vue';

describe('FoundationStatus', () => {
  it('apresenta o nome e a descrição da superfície da extensão', () => {
    const wrapper = mount(FoundationStatus, {
      props: {
        title: 'TaskFlow',
        description: 'Extensão pronta para evoluir.',
      },
    });

    expect(wrapper.get('h1').text()).toBe('TaskFlow');
    expect(wrapper.text()).toContain('Extensão pronta para evoluir.');
  });
});
