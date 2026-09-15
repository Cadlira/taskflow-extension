import type { ActivePageReader } from '@/application/page-capture';

/** Lê título e URL da aba ativa somente quando acionado por um gesto do usuário. */
export class ChromeActivePageReader implements ActivePageReader {
  async read(): Promise<{ title?: string; url?: string }> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    return {
      ...(tab?.title !== undefined ? { title: tab.title } : {}),
      ...(tab?.url !== undefined ? { url: tab.url } : {}),
    };
  }
}
