#!/usr/bin/bash
sudo service nginx stop
sudo certbot renew --force-renewal --standalone
sudo cp -a /etc/letsencrypt/live/1337.naezith.com/. ~/cert
sudo service nginx start
sudo pm2 restart baas-server
