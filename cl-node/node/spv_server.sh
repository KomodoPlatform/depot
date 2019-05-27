#!/usr/bin/bash

# This script will run in 'screen'
# .sh Naezith NAE rpcuser rpcpassword rpcport

name=$1
ticker=$2
db_dir=/home/ubuntu/spv-server/SPV/$ticker

export DB_DIRECTORY=$db_dir
export COIN=$name
export DAEMON_URL=http://$3:$4@localhost:$5/

# Add the new coin
sudo python3.6 /home/ubuntu/spv-server/electrumx/setup.py build
sudo python3.6 /home/ubuntu/spv-server/electrumx/setup.py install

/home/ubuntu/spv-server/electrumx/electrumx_server
