mkdir /home/ubuntu/komodo_update
wget -qO- https://github.com/KomodoPlatform/komodo/releases/download/0.5.0/komodo_0.5.0_linux.tar.gz | tar xvz -C /home/ubuntu/komodo_update
mv /home/ubuntu/komodo_update/linux64/komodod /home/ubuntu/komodo/src
mv /home/ubuntu/komodo_update/linux64/komodo-cli /home/ubuntu/komodo/src
mv /home/ubuntu/komodo_update/linux64/fetch-params.sh /home/ubuntu/komodo/zcutil/
rm -rf /home/ubuntu/komodo_update
/home/ubuntu/komodo/zcutil/fetch-params.sh 
sudo reboot
