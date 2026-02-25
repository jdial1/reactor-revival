export class VisualEventRendererUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(eventBufferDescriptor) {
    if (!eventBufferDescriptor || eventBufferDescriptor.head === eventBufferDescriptor.tail) return;
    const { buffer, head, tail, max } = eventBufferDescriptor;
    const tileset = this.ui.game?.tileset;
    if (!tileset || !buffer) return;
    let pos = tail;
    while (pos !== head) {
      const idx = pos * 4;
      const typeId = buffer[idx];
      const row = buffer[idx + 1];
      const col = buffer[idx + 2];
      const t = tileset.getTile(row, col);
      if (t) {
        if (typeId === 1) {
          this.ui.gridController.spawnTileIcon('power', t, null);
        } else if (typeId === 2 && t.part?.category === 'vent') {
          this.ui.gridController.blinkVent(t);
        }
      }
      pos = (pos + 1) % max;
    }
    if (this.ui.game?.engine && typeof this.ui.game.engine.ackEvents === 'function') {
      this.ui.game.engine.ackEvents(head);
    }
  }
}
