/**
 * Application Initialization Module
 * 
 * Loads and initializes the main application modules:
 * - Foundry Agents UI wiring
 * - Main application module
 */

import { wireFoundryUi } from '/js/handlers/foundry-agents.js';

// Initialize Foundry UI support
wireFoundryUi().catch(err => console.error('Error initializing Foundry UI:', err));

// Import main application module
import '/js/core/app.js?v=1.0.3';
