#!/bin/bash

echo "starting server now"

(while true; do echo -ne 'HTTP/1.1 200 OK\r\n\r\nOK\r\n'|./nc -l -p 8080;done)
