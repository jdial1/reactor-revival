export const UPDATE_TOAST_STYLES = `
  .update-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #2a2a2a;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    padding: 0;
    z-index: 10000;
    font-family: 'Minecraft', monospace;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: toast-slide-up 0.3s ease-out;
    max-width: 400px;
    width: 90%;
  }
  .update-toast-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 12px;
  }
  .update-toast-message {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    color: #fff;
  }
  .update-toast-icon { font-size: 1.2em; }
  .update-toast-text { font-size: 0.9em; font-weight: 500; }
  .update-toast-button {
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-family: 'Minecraft', monospace;
    font-size: 0.8em;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
  }
  .update-toast-button:hover { background: #45a049; }
  .update-toast-close {
    background: transparent;
    color: #ccc;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
    transition: color 0.2s;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .update-toast-close:hover { color: #fff; }
  @keyframes toast-slide-up {
    from { transform: translateX(-50%) translateY(100px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @media (max-width: 480px) {
    .update-toast {
      bottom: 10px;
      left: 10px;
      right: 10px;
      transform: none;
      max-width: none;
      width: auto;
    }
    .update-toast-content { padding: 10px 12px; gap: 8px; }
    .update-toast-text { font-size: 0.8em; }
    .update-toast-button { padding: 6px 12px; font-size: 0.75em; }
  }
`;
