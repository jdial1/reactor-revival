# Test Fixes TODO

## ✅ COMPLETED

- [x] Fix chronometer upgrade test - loop_wait calculation incorrect
- [x] Fix quantum buffering upgrade test - max_heat calculation incorrect
- [x] Fix heat exchanger chain test - first exchanger not receiving heat
- [x] Fix extreme vent power consumption test - power consumption calculation
      issue
- [x] Fix basic cooling setup test - heat not flowing through system

## 🔄 IN PROGRESS

- [ ] Fix heat distribution fix test - heat not being distributed to neighbors
- [ ] Fix heat overload scenario test - heat not being transferred to vents

## ❌ REMAINING ISSUES

- [ ] Fix heat distribution test - heat not being distributed to neighbors
- [ ] Fix engine heat transfer test - total heat calculation issue
- [ ] Fix scenarios checkerboard layout test - vents not dissipating heat
      properly
- [ ] Fix game reactor expansion preservation test - rows/cols not preserved
      during reboot

## Component Explosion Issues

- [ ] Fix extreme capacitor explosion test - explosion not triggering properly
- [ ] Fix extreme vent explosion test - explosion not triggering properly
- [ ] Fix extreme heat exchanger explosion test - explosion not triggering
      properly
- [ ] Fix thermionic coolant cell explosion test - explosion not triggering
      properly

## Service Worker Issues

- [ ] Fix service worker registration tests - registration not working properly
- [ ] Fix service worker caching tests - cache operations failing
- [ ] Fix service worker lifecycle tests - lifecycle management issues

## Page Router Issues

- [ ] Fix page router grid transition test - missing reactor element handling

## NOTES

- Heat distribution logic in engine.js seems to have fundamental issues
- The `_updatePartCaches()` method correctly identifies cells, but heat
  distribution is not working
- Need to investigate why heat is not being distributed to neighbors properly
- Service worker tests are failing due to environment issues (likely need
  mocking)
