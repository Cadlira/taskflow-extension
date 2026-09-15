import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBackupFile } from '@/application/backup/backup-file';
import { BACKUP_MAX_BYTES, createBackupService } from '@/application/backup/backup-service';
import { TaskStorageError } from '@/application/task-repository';
import BackupManager from '@/components/backup/BackupManager.vue';
import {
  BACKUP_REASON_LABELS,
  BACKUP_RESTORE_UNCONFIRMED_MESSAGE,
  BACKUP_UNENCRYPTED_WARNING,
  BACKUP_FIELD_LABELS,
  RESTORE_CONFIRM_MESSAGE,
  RESTORE_CONFIRM_TITLE,
} from '@/components/backup/backup-labels';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import { formatDateTime } from '@/components/tasks/date-time';
import { REMINDERS_PENDING_MESSAGE } from '@/components/tasks/task-labels';
import type { Task } from '@/domain/task';
import { FakeReminderScheduler, InMemoryTaskRepository } from '../../support/fakes';
import { buildTask, FIXED_NOW, hoursFrom } from '../../support/task-fixtures';

const EXPORTED_AT = '2026-09-10T12:00:00.000Z';

type Scope = Omit<DOMWrapper<Element>, 'exists'>;

function setup(tasks: Task[] = [buildTask()]) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  const service = createBackupService({
    repository,
    scheduler,
    clock: () => FIXED_NOW,
    appVersion: '0.1.0',
  });

  return { repository, scheduler, service };
}

type Context = ReturnType<typeof setup>;

let wrapper: VueWrapper | undefined;
let downloadedFileName = '';
let lastBlob: Blob | undefined;

beforeEach(() => {
  downloadedFileName = '';
  lastBlob = undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    lastBlob = blob as Blob;
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedFileName = this.download;
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

async function mountManager(context: Context = setup()) {
  wrapper = mount(BackupManager, {
    global: { provide: { [backupServiceKey as symbol]: context.service } },
    attachTo: document.body,
  });
  await flushPromises();
  return { context, wrapper };
}

function button(root: Pick<Scope, 'findAll'>, label: string) {
  const found = root.findAll('button').find((candidate) => candidate.text().startsWith(label));
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

function fileSource(text: string, size = text.length) {
  return { size, text: () => Promise.resolve(text) };
}

function backupOf(tasks: Task[]): string {
  return encodeBackupFile(tasks, { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });
}

async function selectFile(root: VueWrapper, file: { size: number; text(): Promise<string> }) {
  const input = root.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

async function confirmRestore(root: VueWrapper): Promise<void> {
  await button(root, 'Restaurar').trigger('click');
  await button(root.get('[role="alertdialog"]'), 'Substituir tarefas').trigger('click');
  await flushPromises();
}

describe('BackupManager', () => {
  it('move o foco para o título da área ao abrir', async () => {
    const { wrapper } = await mountManager();

    expect(document.activeElement).toBe(wrapper.get('h1').element);
  });

  describe('exportação', () => {
    it('exporta todas as tarefas, confirma e baixa o arquivo', async () => {
      const tasks = [buildTask({ id: 'a' }), buildTask({ id: 'b', title: 'Segunda' })];
      const { wrapper, context } = await mountManager(setup(tasks));

      await button(wrapper, 'Exportar backup').trigger('click');
      await flushPromises();

      expect(wrapper.get('[aria-live]').text()).toContain('Backup com 2 tarefas exportado.');
      expect(downloadedFileName).toMatch(/^taskflow-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
      expect(lastBlob?.type).toBe('application/json');
      await expect(lastBlob!.text()).resolves.toContain('"format": "taskflow-backup"');
      expect(context.repository.tasks).toHaveLength(2);
    });

    it('ignora cliques repetidos enquanto a exportação está em andamento', async () => {
      const { wrapper, context } = await mountManager();
      const realExport = context.service.exportBackup.bind(context.service);
      let release: () => void = () => undefined;
      const exportBackup = vi
        .spyOn(context.service, 'exportBackup')
        .mockImplementation(async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return realExport();
        });
      const click = vi.mocked(HTMLAnchorElement.prototype.click);

      const exportButton = button(wrapper, 'Exportar backup');
      await exportButton.trigger('click');
      expect(exportButton.attributes('disabled')).toBeDefined();
      await exportButton.trigger('click');
      release();
      await flushPromises();

      expect(exportBackup).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(exportButton.attributes('disabled')).toBeUndefined();
    });

    it('avisa que o arquivo não é criptografado', async () => {
      const { wrapper } = await mountManager();

      expect(wrapper.text()).toContain(BACKUP_UNENCRYPTED_WARNING);
    });

    it('bloqueia a exportação com dados incompatíveis e foca o erro', async () => {
      const { wrapper, context } = await mountManager();
      context.repository.failNext.list = new TaskStorageError('INCOMPATIBLE_DATA', 'formato');

      await button(wrapper, 'Exportar backup').trigger('click');
      await flushPromises();

      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toBe(BACKUP_REASON_LABELS.LOCAL_DATA_INCOMPATIBLE);
      expect(document.activeElement).toBe(alert.element);
      expect(downloadedFileName).toBe('');
    });

    it('informa falha de armazenamento sem gerar arquivo', async () => {
      const { wrapper, context } = await mountManager();
      context.repository.failNext.list = new TaskStorageError('UNAVAILABLE', 'sem acesso');

      await button(wrapper, 'Exportar backup').trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe(BACKUP_REASON_LABELS.STORAGE_UNAVAILABLE);
      expect(downloadedFileName).toBe('');
    });

    it('mostra o estado de leitura e desabilita as ações enquanto lê', async () => {
      const { wrapper } = await mountManager();
      let release: (text: string) => void = () => undefined;
      const file = {
        size: 10,
        text: () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      };

      const input = wrapper.get('input[type="file"]');
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
      await input.trigger('change');

      expect(wrapper.text()).toContain('Lendo arquivo…');
      expect(button(wrapper, 'Exportar backup').attributes('disabled')).toBeDefined();
      expect(button(wrapper, 'Voltar').attributes('disabled')).toBeDefined();

      release(backupOf([buildTask()]));
      await flushPromises();

      expect(wrapper.text()).toContain('Prévia da restauração');
    });
  });

  describe('recusas do arquivo', () => {
    it('limpa o seletor após a leitura para permitir escolher o mesmo arquivo', async () => {
      const { wrapper } = await mountManager();
      const input = wrapper.get('input[type="file"]');
      Object.defineProperty(input.element, 'value', {
        value: 'backup.json',
        writable: true,
        configurable: true,
      });
      Object.defineProperty(input.element, 'files', {
        value: [fileSource('{')],
        configurable: true,
      });

      await input.trigger('change');
      await flushPromises();

      expect((input.element as HTMLInputElement).value).toBe('');
    });

    const rejectionCases: [string, { size: number; text(): Promise<string> }, string][] = [
      [
        'arquivo maior que o limite',
        fileSource('{}', BACKUP_MAX_BYTES + 1),
        BACKUP_REASON_LABELS.FILE_TOO_LARGE,
      ],
      ['JSON inválido', fileSource('{'), BACKUP_REASON_LABELS.INVALID_JSON],
      ['JSON que não é backup', fileSource('{"a":1}'), BACKUP_REASON_LABELS.NOT_TASKFLOW_BACKUP],
      [
        'versão do formato inválida',
        fileSource(
          JSON.stringify({
            format: 'taskflow-backup',
            exportedAt: EXPORTED_AT,
            app: { version: '1' },
            tasks: [],
          }),
        ),
        BACKUP_REASON_LABELS.INVALID_FORMAT_VERSION,
      ],
      [
        'versão mais nova',
        fileSource(
          JSON.stringify({
            format: 'taskflow-backup',
            formatVersion: 3,
            exportedAt: EXPORTED_AT,
            app: { version: '1' },
            tasks: [],
          }),
        ),
        BACKUP_REASON_LABELS.NEWER_FORMAT_VERSION,
      ],
      [
        'estrutura inválida',
        fileSource(
          JSON.stringify({
            format: 'taskflow-backup',
            formatVersion: 1,
            exportedAt: EXPORTED_AT,
            app: { version: '1' },
            tasks: 'x',
          }),
        ),
        BACKUP_REASON_LABELS.INVALID_STRUCTURE,
      ],
    ];

    it.each(rejectionCases)('apresenta a recusa por %s', async (_label, file, expected) => {
      const { wrapper, context } = await mountManager();

      await selectFile(wrapper, file);

      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toContain(expected);
      expect(document.activeElement).toBe(alert.element);
      expect(wrapper.find('.backup-preview').exists()).toBe(false);
      expect(context.repository.tasks).toEqual([buildTask()]);
    });

    it('mostra os cinco primeiros erros de tarefas e a contagem restante', async () => {
      const { wrapper } = await mountManager();
      const invalid = {
        ...buildTask(),
        title: 'x'.repeat(201),
        description: 'y'.repeat(4001),
        requester: 'r'.repeat(121),
        assignee: 'a'.repeat(121),
        status: 'X',
        priority: 'Y',
        sourceUrl: 'ftp://example.com',
        tags: Array.from({ length: 11 }, (_, index) => `t${index}`),
      };
      const text = JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 1,
        exportedAt: EXPORTED_AT,
        app: { version: '0.1.0' },
        tasks: [invalid],
      });

      await selectFile(wrapper, fileSource(text));

      const items = wrapper.findAll('.rejection-issues li');
      expect(items).toHaveLength(5);
      expect(items[0]?.text()).toContain('Tarefa 1');
      expect(items[0]?.text()).toContain('título');
      expect(wrapper.get('.rejection-extra').text()).toContain('mais 3');
      expect(wrapper.get('[role="alert"]').text()).toContain(BACKUP_REASON_LABELS.INVALID_TASKS);
    });

    it('descreve tarefa que não é objeto sem repetir o termo arquivo', async () => {
      const { wrapper } = await mountManager();
      const text = JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 1,
        exportedAt: EXPORTED_AT,
        app: { version: '0.1.0' },
        tasks: ['x'],
      });

      await selectFile(wrapper, fileSource(text));

      expect(wrapper.get('.rejection-issues li').text()).toContain(
        `Tarefa 1: ${BACKUP_FIELD_LABELS.task} — A tarefa não é um objeto válido.`,
      );
      expect(BACKUP_FIELD_LABELS.task).toBe('estrutura');
    });

    it('informa no rótulo o limite de tamanho vigente', () => {
      expect(BACKUP_REASON_LABELS.FILE_TOO_LARGE).toContain(
        `limite de ${BACKUP_MAX_BYTES / (1024 * 1024)} MiB`,
      );
    });
  });

  describe('seletor de arquivo', () => {
    it('é um botão secundário que aciona o input de arquivo', async () => {
      const { wrapper } = await mountManager();
      const picker = button(wrapper, 'Escolher arquivo de backup');
      expect(picker.element.tagName).toBe('BUTTON');
      expect(picker.classes()).toContain('button-secondary');

      const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

      await picker.trigger('click');

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('mantém o input fora do alcance do Tab e oculto', async () => {
      const { wrapper } = await mountManager();
      const input = wrapper.get('input[type="file"]');

      expect(input.attributes('tabindex')).toBe('-1');
      expect(input.attributes('hidden')).toBeDefined();
    });

    it('desabilita a escolha de arquivo durante uma operação', async () => {
      const { wrapper, context } = await mountManager();
      let release: () => void = () => undefined;
      const exportBackup = context.service.exportBackup.bind(context.service);
      vi.spyOn(context.service, 'exportBackup').mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return exportBackup();
      });

      const picker = button(wrapper, 'Escolher arquivo de backup');
      await button(wrapper, 'Exportar backup').trigger('click');
      expect(picker.attributes('disabled')).toBeDefined();

      release();
      await flushPromises();

      expect(picker.attributes('disabled')).toBeUndefined();
    });
  });

  describe('prévia e confirmação', () => {
    it('apresenta data, versões e totais do arquivo e dos dados locais', async () => {
      const local = [buildTask({ id: 'a' }), buildTask({ id: 'b' }), buildTask({ id: 'c' })];
      const { wrapper } = await mountManager(setup(local));

      await selectFile(
        wrapper,
        fileSource(
          backupOf([
            buildTask({ id: 'x' }),
            buildTask({ id: 'y' }),
            buildTask({ id: 'z' }),
            buildTask({ id: 'w' }),
            buildTask({ id: 'v' }),
          ]),
        ),
      );

      const preview = wrapper.get('.backup-preview');
      expect(preview.text()).toContain('Prévia da restauração');
      expect(preview.findAll('dd').map((item) => item.text())).toEqual([
        formatDateTime(EXPORTED_AT),
        '2',
        'TaskFlow 0.1.0',
        '5',
        '3',
      ]);
      expect(preview.text()).toContain('substitui todas as tarefas atuais');
    });

    it('cancelar na prévia descarta o arquivo sem chamar restore', async () => {
      const { wrapper, context } = await mountManager();
      const restore = vi.spyOn(context.service, 'restore');
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));

      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      expect(restore).not.toHaveBeenCalled();
      expect(wrapper.find('.backup-preview').exists()).toBe(false);
      expect(wrapper.find('input[type="file"]').exists()).toBe(true);
      expect(context.repository.tasks).toEqual([buildTask()]);
    });

    it('cancelar na confirmação mantém a prévia sem chamar restore', async () => {
      const { wrapper, context } = await mountManager();
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));
      const restore = vi.spyOn(context.service, 'restore');

      await button(wrapper, 'Restaurar').trigger('click');
      const dialog = wrapper.get('[role="alertdialog"]');
      expect(dialog.text()).toContain(RESTORE_CONFIRM_TITLE);
      expect(dialog.text()).toContain(RESTORE_CONFIRM_MESSAGE);
      expect(restore).not.toHaveBeenCalled();

      await button(dialog, 'Cancelar').trigger('click');
      await flushPromises();

      expect(restore).not.toHaveBeenCalled();
      expect(wrapper.find('.backup-preview').exists()).toBe(true);
    });

    it('exportar os dados atuais mantém a prévia disponível', async () => {
      const { wrapper } = await mountManager();
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));

      await button(wrapper, 'Exportar dados atuais').trigger('click');
      await flushPromises();

      expect(wrapper.find('.backup-preview').exists()).toBe(true);
      expect(downloadedFileName).not.toBe('');
      expect(wrapper.get('[aria-live]').text()).toContain('exportado');
    });

    it('backup vazio informa a remoção de todas as tarefas locais e exige confirmação', async () => {
      const local = [buildTask({ id: 'a' }), buildTask({ id: 'b' })];
      const { wrapper, context } = await mountManager(setup(local));
      await selectFile(wrapper, fileSource(backupOf([])));

      const preview = wrapper.get('.backup-preview');
      expect(preview.text()).toContain('Nenhuma tarefa será restaurada');
      expect(preview.text()).toContain('as 2 tarefas locais serão removidas');
      expect(context.repository.tasks).toHaveLength(2);

      await confirmRestore(wrapper);

      expect(context.repository.tasks).toEqual([]);
    });
  });

  describe('resultado da restauração', () => {
    it('emite o total restaurado e substitui a coleção', async () => {
      const { wrapper, context } = await mountManager(setup([buildTask({ id: 'antiga' })]));
      await selectFile(
        wrapper,
        fileSource(backupOf([buildTask({ id: 'nova' }), buildTask({ id: 'outra' })])),
      );

      await confirmRestore(wrapper);

      expect(wrapper.emitted('restored')).toEqual([
        [{ tone: 'success', text: 'Restauração concluída: 2 tarefas restauradas.' }],
      ]);
      expect(context.repository.tasks.map((task) => task.id)).toEqual(['nova', 'outra']);
    });

    it('avisa lembretes pendentes sem desfazer a restauração', async () => {
      const { wrapper, context } = await mountManager(setup([]));
      await selectFile(
        wrapper,
        fileSource(
          backupOf([
            buildTask({
              id: 'nova',
              dueAt: hoursFrom(FIXED_NOW, 24),
              reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 15 }],
            }),
          ]),
        ),
      );
      context.scheduler.failNext = true;

      await confirmRestore(wrapper);

      const feedback = wrapper.emitted('restored')?.[0]?.[0] as { tone: string; text: string };
      expect(feedback.tone).toBe('warning');
      expect(feedback.text).toContain('1 tarefa restaurada');
      expect(feedback.text).toContain(REMINDERS_PENDING_MESSAGE);
      await expect(context.repository.get('nova')).resolves.toBeDefined();
    });

    it('avisa quando a restauração não pôde ser confirmada', async () => {
      const { wrapper, context } = await mountManager(setup([]));
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));
      vi.spyOn(context.repository, 'list').mockResolvedValueOnce([buildTask({ id: 'outra' })]);

      await confirmRestore(wrapper);

      const feedback = wrapper.emitted('restored')?.[0]?.[0] as { tone: string; text: string };
      expect(feedback.tone).toBe('warning');
      expect(feedback.text).toContain(BACKUP_RESTORE_UNCONFIRMED_MESSAGE);
    });

    it('não permite cancelar a confirmação enquanto a restauração é gravada', async () => {
      const { wrapper, context } = await mountManager(setup([]));
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));
      let release: () => void = () => undefined;
      const replaceAll = context.repository.replaceAll.bind(context.repository);
      vi.spyOn(context.repository, 'replaceAll').mockImplementation(async (tasks) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return replaceAll(tasks);
      });

      await button(wrapper, 'Restaurar').trigger('click');
      await button(wrapper.get('[role="alertdialog"]'), 'Substituir tarefas').trigger('click');
      await flushPromises();

      const dialog = wrapper.get('[role="alertdialog"]');
      expect(button(dialog, 'Cancelar').attributes('disabled')).toBeDefined();
      await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Escape' });
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);

      release();
      await flushPromises();

      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
      expect(wrapper.emitted('restored')).toHaveLength(1);
    });

    it('mostra erro de gravação, foca o alerta e mantém a prévia', async () => {
      const { wrapper, context } = await mountManager(setup([]));
      await selectFile(wrapper, fileSource(backupOf([buildTask({ id: 'nova' })])));
      context.repository.failNext.replaceAll = new TaskStorageError('UNAVAILABLE', 'sem espaço');

      await confirmRestore(wrapper);

      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toBe(BACKUP_REASON_LABELS.STORAGE_UNAVAILABLE);
      expect(document.activeElement).toBe(alert.element);
      expect(wrapper.find('.backup-preview').exists()).toBe(true);
      expect(wrapper.emitted('restored')).toBeUndefined();
    });
  });
});
