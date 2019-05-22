#!/usr/bin/bash
sudo service nginx stop
sudo certbot renew --force-renewal --standalone
sudo service nginx start
