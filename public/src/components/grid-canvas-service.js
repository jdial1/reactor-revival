import { GridCanvasRenderer } from "./ui-grid.js";

let gridCanvasRenderer = null;

export function getGridCanvasRenderer() {
  return gridCanvasRenderer;
}

export function initGridCanvasService(ui) {
  if (gridCanvasRenderer) return gridCanvasRenderer;
  gridCanvasRenderer = new GridCanvasRenderer(ui);
  return gridCanvasRenderer;
}

export function teardownGridCanvasService() {
  gridCanvasRenderer = null;
}
