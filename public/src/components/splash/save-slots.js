import { render } from "lit-html";
import { classMap } from "../../dom/lit.js";
import { logger } from "../../core/logger.js";
import { formatNumber, formatPlaytimeLog } from "../../core/numbers.js";
import { parseAndValidateSave } from "../../domain/game-save.js";
import { StorageAdapter, serializeSave, rotateSlot1ToBackup } from "../../storage/index.js";
import { getUiElement } from "../shell/page-dom.js";
import { saveSlotRowTemplate, saveSlotMainTemplate } from "../../templates/splashTemplates.js";

const formatSlotNumber = (n) => formatNumber(n, { places: 1 });

export class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      selectedSlot: null,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i) {
    const isEmpty = !slotData || !slotData.exists;
    const logId = `LOG ${String(i).padStart(2, "0")}`;
    const swipeKey = `l_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isEmpty,
      swiped: isSwiped,
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      selected: isSelected,
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && now - this._lastTap < 400;
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find((s) => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return saveSlotRowTemplate({
      rowClasses,
      btnClasses,
      i,
      isEmpty,
      logId,
      isSelected,
      slotData,
      onSwipeStart,
      onSwipeEnd,
      onSlotClick,
      onDeleteClick,
      formatPlaytimeLog,
      formatSlotNumber,
    });
  }

  _mainTemplate() {
    const localSlots = [1, 2, 3].map((i) => this.state.localSaveSlots.find((s) => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const validated = parseAndValidateSave(event.target.result);
          await rotateSlot1ToBackup(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      getUiElement(null, "load-from-file-input")?.click();
    };

    return saveSlotMainTemplate({
      localSlots,
      selectedSlot: this.state.selectedSlot,
      onHeaderTouchStart: (e) => {
        this._headerStartY = e.touches[0].clientY;
      },
      onHeaderTouchEnd: (e) => {
        if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
      },
      onClose: () => this._close(),
      onFileChange,
      onRestore: () => this._handleRestore(),
      onImportBackup: triggerFileInput,
      renderSlot: (slot, idx) => this._slotTemplate(slot, idx),
    });
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const logId = `LOG ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;
    await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      selectedSlot: null,
      swipedSlots: new Set(),
    };

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const firstFilled = this.state.localSaveSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
    }

    this.render();
  }
}
