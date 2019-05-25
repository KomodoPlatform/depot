#!/usr/bin/bash

sudo service nginx stop

if [ "$1" != "copy" ]; then
  sudo certbot renew --force-renewal --standalone
fi

sudo cp -a -L /etc/letsencrypt/live/chainlizard.kmd.dev/. ~/cert
sudo chmod -R 777 cert
sudo service nginx start
sudo pm2 restart baas-server
