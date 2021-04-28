############################
# Final container
############################
FROM registry.cto.ai/official_images/python:2-3.7-buster-slim

WORKDIR /ops

ADD requirements.txt .

RUN pip3 install -r requirements.txt

ADD . .
RUN chown -R ops:9999 /ops /home/ops
