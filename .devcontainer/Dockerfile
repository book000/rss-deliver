FROM mcr.microsoft.com/devcontainers/typescript-node:0-18

# Install additional packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Activate corepack
RUN corepack enable

WORKDIR /work
