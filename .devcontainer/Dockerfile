FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# System deps for Playwright headless Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    fonts-liberation xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm as fallback (WXT scaffold requires npx; runtime can use bun)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Global Biome CLI for pre-commit hooks outside workspace context
RUN npm install -g @biomejs/biome

WORKDIR /workspaces/idle
