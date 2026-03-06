# Reactor Revival Documentation

Welcome to the Reactor Revival documentation. This collection provides comprehensive information about the game's architecture, data management, game mechanics, and UI/UX specifications.

## 📚 Documentation Structure

### Core Documentation
- **[DOCUMENTATION.md](DOCUMENTATION.md)** - Complete consolidated documentation covering all aspects of the game

### Archive
- **[archive/](archive/)** - Historical analysis documents and specialized reviews

## 🎯 Key Development Guidelines

### Asset Management
- **Large Numbers:** The game uses Break Infinity (`break_infinity.js`) for arbitrary-precision arithmetic. Values from JSON are converted via `toDecimal()` in `utils/decimal.js` to `Decimal` instances.
- **Data-Driven Design:** All game content is externalized into JSON files for easy modification

### Architecture Principles
- **Separation of Concerns:** Clear boundaries between core logic, UI, and services layers
- **Event-Driven Design:** Components communicate through well-defined events and state management
- **Modular Structure:** Each module has a single responsibility and minimal dependencies

## 🚀 Quick Start

1. **Setup:** Follow the main project README for development environment setup
2. **Architecture:** Understand the three-layer architecture before making changes
3. **Testing:** Use the comprehensive test suite to validate changes

## 📖 Reading Order

For new developers, we recommend reading the documentation in this order:
1. **System and Architecture** - Understand the overall structure
2. **Application Lifecycle Processes** (§1.3.4) - Splash Load, New Game Load, Load Game flows
3. **Data Content Management** - Learn about data files and asset requirements
4. **Critical Game Mechanics** - Understand core gameplay systems
5. **UI/UX Specification** - Learn about interface requirements and optimization

## 🔧 Development Tools

- **Performance Monitoring:** Built-in tools track loading times and asset optimization

## 📝 Contributing

When contributing to Reactor Revival:
1. **Follow Asset Guidelines:** Adhere to the established asset management practices
2. **Maintain Architecture:** Respect the separation between core logic and UI layers
3. **Update Documentation:** Keep documentation current with code changes
4. **Test Thoroughly:** Ensure changes work across all supported devices and browsers

---

For questions or clarifications about the documentation, please refer to the main [DOCUMENTATION.md](DOCUMENTATION.md) file or open an issue on the project repository.
