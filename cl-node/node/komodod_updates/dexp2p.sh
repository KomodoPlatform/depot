# Check if this patch is done

mkdir /home/ubuntu/komodo_update
wget -qO- https://raw.githubusercontent.com/KomodoPlatform/depot/master/cl-node/node/custom_builds/dexp2p-linux64.tar.gz | tar xvz -C /home/ubuntu/komodo_update
mv /home/ubuntu/komodo_update/linux64/komodod /home/ubuntu/komodo/src
mv /home/ubuntu/komodo_update/linux64/komodo-cli /home/ubuntu/komodo/src
mv /home/ubuntu/komodo_update/linux64/fetch-params.sh /home/ubuntu/komodo/zcutil/
rm -rf /home/ubuntu/komodo_update
/home/ubuntu/komodo/zcutil/fetch-params.sh 

# Save that this patch is done

sudo reboot
