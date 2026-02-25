export function getIndex(row, col, cols) {
  return row * cols + col;
}

export function isInBounds(nr, nc, rows, cols) {
  return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
}
