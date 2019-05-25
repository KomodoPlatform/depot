#!/usr/bin/bash

sudo service nginx stop

if [ "$1" != "copy" ]; then
  sudo certbot renew --force-renewal --standalone
fi

sudo service nginx start
