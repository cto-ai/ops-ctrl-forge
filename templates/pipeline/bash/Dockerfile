############################
# Final container
############################
FROM registry.cto.ai/official_images/base:2-buster-slim

WORKDIR /ops

ADD . .

RUN bash -c "./dependencies.sh"
RUN chown -R ops:9999 /ops /home/ops

USER ops
ENV USER ops
ENV HOME /ops
ENV XDG_RUNTIME_DIR=/run/ops/9999
