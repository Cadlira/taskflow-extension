import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '@/components/backup/download-text-file';

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('baixa o conteúdo como JSON, nomeia o arquivo e revoga a URL', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:taskflow');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTextFile('taskflow-backup-2026-09-13-1830.json', '{"format":"taskflow-backup"}');

    const clicked = click.mock.contexts[0] as HTMLAnchorElement | undefined;

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    await expect(blob.text()).resolves.toBe('{"format":"taskflow-backup"}');

    expect(clicked?.download).toBe('taskflow-backup-2026-09-13-1830.json');
    expect(clicked?.href).toBe('blob:taskflow');
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:taskflow');
  });
});
