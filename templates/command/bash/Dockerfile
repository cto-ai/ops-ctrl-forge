############################
# Final container
############################
FROM registry.cto.ai/official_images/bash:2-buster-slim

WORKDIR /ops

ADD . .

RUN chown -R ops:9999 /ops /home/ops
