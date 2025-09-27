// Central export for all validators to enable tree-shaking
export * from './campaign';  
export * from './template';
export * from './list';
export * from './subscriber';

// Common validation utilities
export { z } from 'zod';