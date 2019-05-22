#!/usr/bin/bash

copy_cert () {
  sudo cp -a -L /etc/letsencrypt/live/1337.naezith.com/. ~/cert
}

if ["$1" = "copy"]; then
  copy_cert()
else
  sudo service nginx stop
  sudo certbot renew --force-renewal --standalone
  copy_cert()
  sudo service nginx start
  sudo pm2 restart baas-server
fi
