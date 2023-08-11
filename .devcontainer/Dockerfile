FROM mcr.microsoft.com/devcontainers/base:alpine-3.18

# hadolint ignore=DL3018
RUN apk update && apk add --no-cache \
    python3 \
    nodejs \
    npm \
    yarn \
    git \
    openssh-client \
    python3-dev \
    py3-pip \
    build-base \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    librsvg-dev \
    && rm -rf /var/cache/apk/*

WORKDIR /work
