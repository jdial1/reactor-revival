# Sentinel's Journal

This document tracks systemic security vulnerabilities and recurring patterns discovered in this codebase.

| Date       | Title                         | Learning                                                                                                                              | Action                                                                                                             |
|------------|-------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| 2024-08-14 | Unmaintained Dev Dependencies | The project uses `live-server`, an unmaintained package with known vulnerabilities, as its development server. This increases the attack surface for developers and can lead to downstream security issues. | Replaced `live-server` with `vite`, a modern and actively maintained development server that was already a dependency. |
