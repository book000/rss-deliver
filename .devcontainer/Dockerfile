FROM mcr.microsoft.com/devcontainers/typescript-node:0-20

# Install additional packages
# hadolint ignore=DL3008
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

COPY .node-version /work/.node-version
RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install $(cat /work/.node-version) && nvm use $(cat /work/.node-version)"

WORKDIR /work
