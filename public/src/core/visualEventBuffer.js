export function createVisualEventBuffer(maxEvents) {
  const buffer = new Uint32Array(maxEvents * 4);
  let head = 0;
  let tail = 0;
  return {
    enqueue(typeId, row, col, value) {
      const idx = head * 4;
      buffer[idx] = typeId;
      buffer[idx + 1] = row;
      buffer[idx + 2] = col;
      buffer[idx + 3] = value;
      head = (head + 1) % maxEvents;
      if (head === tail) tail = (tail + 1) % maxEvents;
    },
    getEventBuffer() {
      return { buffer, head, tail, max: maxEvents };
    },
    ack(newTail) {
      tail = newTail;
    }
  };
}
