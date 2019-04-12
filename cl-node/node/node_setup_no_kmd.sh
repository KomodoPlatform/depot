#!/usr/bin/bash

sudo apt-get update
sudo apt-get -y install build-essential pkg-config libc6-dev m4 g++-multilib autoconf libtool ncurses-dev unzip git python python-zmq zlib1g-dev wget libcurl4-openssl-dev bsdmainutils automake curl nginx

## Setup Firewall
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow out 53
sudo ufw allow ssh
sudo ufw allow out ssh
sudo ufw allow http
sudo ufw allow out http
sudo ufw allow https
sudo ufw allow out https
sudo ufw allow 1337
sudo ufw allow out 1337
sudo ufw --force enable

## Install Node for the custom script
mkdir /home/ubuntu/.nvm
wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash

export NVM_DIR="/home/ubuntu/.nvm"
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && \. "/home/ubuntu/.nvm/nvm.sh"  # This loads nvm
[ -s "/home/ubuntu/.nvm/bash_completion" ] && \. "/home/ubuntu/.nvm/bash_completion"  # This loads nvm bash_completion

nvm install v4 # For Explorer

## Setup Komodo Explorer
sudo apt-get -y install libssl-dev libprotobuf-dev protobuf-compiler libqt4-dev libqrencode-dev libdb++-dev ntp ntpdate libboost-all-dev libncurses5-dev libevent-dev libcurl4-gnutls-dev libsodium-dev libzmq3-dev

export NVM_DIR="/home/ubuntu/.nvm"
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && . "/home/ubuntu/.nvm/nvm.sh" # This loads nvm

mkdir /home/ubuntu/cl-explorer
cd /home/ubuntu/cl-explorer
npm install --prefix /home/ubuntu/cl-explorer git+https://git@github.com/DeckerSU/bitcore-node-komodo 

# KMD config
mkdir -p /home/ubuntu/.komodo
cat <<EOF > /home/ubuntu/.komodo/komodo.conf
server=1
whitelist=127.0.0.1
txindex=1
addressindex=1
timestampindex=1
spentindex=1
zmqpubrawtx=tcp://127.0.0.1:8332
zmqpubhashblock=tcp://127.0.0.1:8332
rpcallowip=127.0.0.1
rpcport=8232
rpcuser=bitcoin
rpcpassword=local321
uacomment=bitcore
showmetrics=0
EOF

# Create KMD explorer and bitcore-node.json config for it
/home/ubuntu/cl-explorer/node_modules/bitcore-node-komodo/bin/bitcore-node create /home/ubuntu/cl-explorer/KMD-explorer
cd /home/ubuntu/cl-explorer/KMD-explorer
/home/ubuntu/cl-explorer/node_modules/bitcore-node-komodo/bin/bitcore-node install git+https://git@github.com/DeckerSU/insight-api-komodo git+https://git@github.com/DeckerSU/insight-ui-komodo

cat << EOF > /home/ubuntu/cl-explorer/KMD-explorer/bitcore-node.json
{  
   "network":"mainnet",
   "port":3001,
   "services":[  
      "bitcoind",
      "insight-api-komodo",
      "insight-ui-komodo",
      "web"
   ],
   "servicesConfig":{  
      "bitcoind":{  
         "connect":[  
            {  
               "rpchost":"127.0.0.1",
               "rpcport":8232,
               "rpcuser":"bitcoin",
               "rpcpassword":"local321",
               "zmqpubrawtx":"tcp://127.0.0.1:8332"
            }
         ]
      },
      "insight-api-komodo":{  
         "rateLimiterOptions":{  
            "whitelist":[  
               "::ffff:127.0.0.1",
               "127.0.0.1"
            ],
            "whitelistLimit":500000,
            "whitelistInterval":3600000
         }
      }
   }
}
EOF

# Create launch scrıpt for explorer
cat << EOF > /home/ubuntu/cl-explorer/KMD-explorer-start.sh
#!/bin/bash

export NVM_DIR="/home/ubuntu/.nvm"
[ -s "/home/ubuntu/.nvm/nvm.sh" ] && . "/home/ubuntu/.nvm/nvm.sh" # This loads nvm

cd /home/ubuntu/cl-explorer/KMD-explorer
nvm exec v4 ./node_modules/bitcore-node-komodo/bin/bitcore-node start
EOF
chmod +x /home/ubuntu/cl-explorer/KMD-explorer-start.sh

# Install latest Node 
nvm install node
nvm alias default node
nvm use node
