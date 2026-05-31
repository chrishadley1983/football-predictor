// Global test setup. Registers @testing-library/jest-dom matchers (used by the
// jsdom component tests). Registering them in node-env tests is harmless — they
// only do anything when asserted against DOM nodes. RTL auto-cleanup runs via
// Vitest's global afterEach (test.globals = true).
import '@testing-library/jest-dom/vitest'
