import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
globalThis.URL.revokeObjectURL = vi.fn();
