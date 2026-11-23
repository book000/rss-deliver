FROM mcr.microsoft.com/devcontainers/typescript-node:4-20

COPY .node-version /tmp/node-version
RUN su node -s /bin/bash -c "export NVM_SYMLINK_CURRENT=true && . /usr/local/share/nvm/nvm.sh && nvm install $(cat /tmp/node-version) && nvm alias default $(cat /tmp/node-version)" \
    && rm /tmp/node-version
ENV PATH=/usr/local/share/nvm/current/bin:${PATH}

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
