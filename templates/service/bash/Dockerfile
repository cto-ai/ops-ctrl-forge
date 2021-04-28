############################
# Final container
############################
FROM registry.cto.ai/official_images/bash:2-buster-slim

WORKDIR /ops

RUN curl https://busybox.net/downloads/binaries/1.21.1/busybox-x86_64 > busybox && chmod +x ./busybox && ln -s busybox nc

ADD . .

RUN chown -R ops:9999 /ops /home/ops
