/**
 * Salva um texto como arquivo pelo mecanismo de download do navegador, sem APIs do Chrome:
 * cria um Blob, dispara um `<a download>` temporário e revoga a URL em seguida.
 */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
