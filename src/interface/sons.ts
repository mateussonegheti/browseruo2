/** Toca os sons extraídos do cliente (public/sons/<id>.wav). Sem os arquivos, fica em silêncio. */
export class Sons {
  ativo = true;
  private readonly cache = new Map<string, HTMLAudioElement>();

  constructor(private readonly volume = 0.5) {}

  tocar(id: string): void {
    if (!this.ativo) return;
    let base = this.cache.get(id);
    if (!base) {
      base = new Audio(`/sons/${id}.wav`);
      base.volume = this.volume;
      this.cache.set(id, base);
    }
    // Clona para permitir o mesmo som sobreposto (duas magias seguidas)
    const audio = base.cloneNode() as HTMLAudioElement;
    audio.volume = this.volume;
    audio.play().catch(() => { /* arquivo ausente ou navegador bloqueou o áudio */ });
  }
}
