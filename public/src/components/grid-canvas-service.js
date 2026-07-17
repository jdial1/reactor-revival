import { GridCanvasRenderer } from "./ui-grid.js";

let gridCanvasRenderer = null;

export const getGridCanvasRenderer = () => gridCanvasRenderer;

export const initGridCanvasService = (ui) => {
  if (gridCanvasRenderer) return gridCanvasRenderer;
  gridCanvasRenderer = new GridCanvasRenderer(ui);
  return gridCanvasRenderer;
};

export const teardownGridCanvasService = () => {
  gridCanvasRenderer = null;
};
