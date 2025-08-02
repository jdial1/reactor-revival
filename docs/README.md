# Reactor Revival Documentation
Welcome to the Reactor Revival documentation. This collection of documents provides comprehensive information about the game's architecture, data management, game mechanics, and UI/UX specifications.
## 📚 Documentation Structure
### Core Documentation
- **[01-System-and-Architecture.md](01-System-and-Architecture.md)** - System architecture, module design, and performance optimization strategies
- **[02-Data-Content-Management.md](02-Data-Content-Management.md)** - Data file schemas, large number handling, and image asset management
- **[03-Critical-Game-Mechanics.md](03-Critical-Game-Mechanics.md)** - Core gameplay mechanics, heat management, and reactor simulation
- **[04-UI-UX-Specification.md](04-UI-UX-Specification.md)** - User interface requirements, responsive design, and image asset optimization
### Specialized Documentation
- **[05-Asset-Management-Guidelines.md](05-Asset-Management-Guidelines.md)** - Comprehensive guide for performance optimization, and asset management best practices
- **[HEAT_POWER_SCALING_CRITICAL.md](HEAT_POWER_SCALING_CRITICAL.md)** - Critical analysis of heat and power scaling mechanics
## 🎯 Key Development Guidelines
### Asset Management
- **Large Numbers:** Values exceeding `Number.MAX_SAFE_INTEGER` must be stored as strings in JSON files
- **BigInt Parsing:** Core logic automatically parses string numbers into `BigInt` for precise calculations
- **Data-Driven Design:** All game content is externalized into JSON files for easy modification
### Architecture Principles
- **Separation of Concerns:** Clear boundaries between core logic, UI, and services layers
- **Event-Driven Design:** Components communicate through well-defined events and state management
- **Modular Structure:** Each module has a single responsibility and minimal dependencies
## 🚀 Quick Start
1. **Setup:** Follow the main project README for development environment setup
3. **Architecture:** Understand the three-layer architecture before making changes
4. **Testing:** Use the comprehensive test suite to validate changes
## 📖 Reading Order
For new developers, we recommend reading the documentation in this order:
1. **System and Architecture** - Understand the overall structure
2. **Data Content Management** - Learn about data files and asset requirements
4. **Critical Game Mechanics** - Understand core gameplay systems
5. **UI/UX Specification** - Learn about interface requirements and optimization
## 🔧 Development Tools

- **Performance Monitoring:** Built-in tools track loading times and asset optimization
## 📝 Contributing
When contributing to Reactor Revival:
1. **Follow Asset Guidelines:**
2. **Maintain Architecture:** Respect the separation between core logic and UI layers
3. **Update Documentation:** Keep documentation current with code changes
4. **Test Thoroughly:** Ensure changes work across all supported devices and browsers
---
For questions or clarifications about the documentation
