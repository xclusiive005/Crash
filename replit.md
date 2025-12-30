# SOLSTAx - Solana Crash Game

## Overview

SOLSTAx is a high-stakes crash game built on the Solana blockchain. The application allows users to place bets and watch a multiplier rise in real-time, with the goal of cashing out before the game "crashes". The project features both manual and automated betting modes, with an intelligent betting algorithm based on pattern analysis.

This is a full-stack web application combining a React-based frontend with an Express backend, using PostgreSQL for data persistence. The game includes full wallet integration for Solana blockchain connectivity with both demo and real SOL modes.

### Game Modes
- **Demo Mode**: Practice with unlimited demo credits (default 10,000)
- **Real Mode**: Play with deposited SOL from connected wallet
- Mode toggle in header, automatically resets session when switching
- Real mode requires deposited SOL balance > 0

### Vault System
- **Vault Address**: H9ecbrX7Wawm1URVCWvvmUZFrWBnv5Zx1PnDzjb7DYbW
- **Private Key**: Stored securely in VAULT_PRIVATE_KEY secret
- **Deposits**: Users send SOL to vault → Click "Check for Deposits" → Credits real balance
- **Withdrawals**: POST /api/withdraw sends real SOL from vault to player wallet
- **House Edge**: 2.5% on all bets

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- **React 18** with TypeScript for the UI layer
- **Vite** as the build tool and development server, chosen for its fast hot module replacement and optimized production builds
- **Wouter** for lightweight client-side routing instead of React Router, reducing bundle size
- **TailwindCSS** with custom configuration for styling, using a dark cyberpunk/neon aesthetic with custom color variables

**UI Component System**
- **shadcn/ui** component library (New York style variant) built on Radix UI primitives
- Provides accessible, customizable components like dialogs, dropdowns, forms, and tooltips
- Custom theming through CSS variables defined in `index.css` with neon color palette

**State Management**
- **TanStack Query (React Query)** for server state management and caching
- Handles data fetching, caching, and synchronization with the backend
- Local React state (useState, useRef) for UI-specific state like game animations

**Game Logic**
- Custom crash game engine implemented in `client/src/lib/simulation.ts`
- Pattern analysis algorithm based on Nubs27's crash script (`client/src/lib/nubs27-script.ts`)
- Analyzes crash history to make intelligent betting decisions
- Tracks streaks, gaps between high-value crashes, and payout percentages

### Backend Architecture

**Server Framework**
- **Express.js** as the HTTP server
- HTTP server wrapped with Node's `createServer` for potential WebSocket upgrades
- Middleware stack includes JSON parsing with raw body preservation for webhook support

**API Design**
- RESTful API endpoints under `/api` prefix
- Routes defined in `server/routes.ts`:
  - `GET /api/user/stats` - Fetch user balance (demo + real), game mode, and statistics
  - `POST /api/user/config` - Update betting configuration
  - `POST /api/user/game-mode` - Toggle between demo and real modes
  - `POST /api/games` - Record game results (uses correct balance based on mode)
  - `GET /api/games` - Retrieve game history
  - `GET /api/user/profile` - Get user profile information
  - `POST /api/user/profile` - Update user profile
  - `GET /api/vault/address` - Get vault deposit address and balance
  - `POST /api/deposits/check` - Scan blockchain for new deposits
  - `GET /api/deposits` - Get user deposit history
  - `POST /api/withdraw` - Withdraw real SOL winnings to player wallet

**Storage Layer**
- Abstraction pattern with `IStorage` interface in `server/storage.ts`
- `DbStorage` implementation using Drizzle ORM
- Supports easy swapping of storage backends if needed

### Data Storage

**Database**
- **PostgreSQL** via Neon serverless driver (`@neondatabase/serverless`)
- Connection pooling for efficient database access
- Database URL configured via `DATABASE_URL` environment variable

**ORM & Schema**
- **Drizzle ORM** for type-safe database queries
- Schema defined in `shared/schema.ts` with two main tables:

**Users Table**
- Stores user credentials, balance, and betting configuration
- Fields: id (UUID), username, password, balance, realBalance, gameMode, baseBet, stopLoss, autoBetEnabled
- Profile fields: displayName, avatarUrl, walletAddress, social handles (X, TikTok, Telegram, Discord), email

**Games Table**
- Records every game played with full details
- Fields: id, userId, crash point, result (Won/Lost), profit, bet amount, balance after game, mode (Manual/Auto), gameMode (demo/real), target multiplier, timestamp

**Deposits Table**
- Tracks SOL deposits to the vault
- Fields: id, userId, signature (unique transaction signature), amountLamports, amountSol, status, fromAddress, timestamp

**Schema Validation**
- **Zod** schemas generated from Drizzle tables using `drizzle-zod`
- Type-safe validation for API inputs
- Shared types between frontend and backend via `shared/schema.ts`

### Build & Deployment

**Build Process**
- Custom build script (`script/build.ts`) using esbuild
- Client built with Vite, output to `dist/public`
- Server bundled with esbuild to `dist/index.cjs`
- Selective bundling: frequently-used dependencies bundled, others marked as external
- Reduces cold start times by minimizing file system operations

**Development Environment**
- Separate dev commands for client (`vite dev`) and server (`tsx server/index.ts`)
- Vite HMR integration in development mode via `server/vite.ts`
- Source maps enabled for debugging

**Production**
- Server serves static client files from `dist/public`
- Single entry point: `node dist/index.cjs`
- Environment variables: `NODE_ENV`, `DATABASE_URL`

## External Dependencies

### Blockchain Integration
- **Solana Web3.js** (`@solana/web3.js`) - Core Solana blockchain library
- **Solana Wallet Adapter** - Suite of wallet integration packages:
  - `@solana/wallet-adapter-react` - React hooks and context
  - `@solana/wallet-adapter-react-ui` - Pre-built UI components
  - `@solana/wallet-adapter-phantom` - Phantom wallet support
  - `@solana/wallet-adapter-base` - Base wallet adapter types
- Connected to Solana mainnet-beta cluster
- Currently used for wallet connection UI; actual game transactions are simulated locally

### Database Service
- **Neon** - Serverless PostgreSQL hosting
- WebSocket-based connection using `ws` library
- Configured via `DATABASE_URL` environment variable

### UI & Component Libraries
- **Radix UI** - Unstyled, accessible component primitives (30+ components)
- **Lucide React** - Icon library
- **TailwindCSS** - Utility-first CSS framework
- **class-variance-authority** - Utility for managing component variants
- **tailwindcss-animate** - Animation utilities

### Form Handling
- **React Hook Form** - Form state management
- **@hookform/resolvers** - Validation resolver integration with Zod

### Development Tools
- **Replit-specific plugins**:
  - `@replit/vite-plugin-runtime-error-modal` - Enhanced error display
  - `@replit/vite-plugin-cartographer` - Development tools
  - `@replit/vite-plugin-dev-banner` - Development mode banner
- Custom `vite-plugin-meta-images.ts` - Dynamically updates OpenGraph meta tags for Replit deployments

### Font Configuration
- **Google Fonts**: Orbitron (display), Rajdhani (sans-serif), JetBrains Mono (monospace)
- Loaded via HTML link tags in `client/index.html`