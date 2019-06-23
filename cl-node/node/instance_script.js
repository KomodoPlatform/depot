// Put this file to home folder of the instance

const fs = require('fs')

console.log('Starting instance script...')

const exec = require('child_process').exec
const execSync = require('child_process').execSync
const https = require('https')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const replaceAll = (string, search, replacement) => string.split(search).join(replacement)

const ac_name = process.argv[2]
const action = process.argv[3]
const server_url = process.argv[4] || '' // Needs to end with / because the action will be appended as endpoint
const database_id = process.argv[5] || '' 
const kmd_address = process.argv[6] || '' 
const ac_supply = process.argv[7] || '' 


const reportSPVEnabled =  chain_id => {
    return new Promise(function (resolve, reject) {
        try {
            const req = https.request(server_url + '/chains/report/spvEnabled', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }
            }, res => res.on('data', d => {
                process.stdout.write(d + '\n')
                if(JSON.parse(d).status === 0) resolve()
                else reject()
            }))
            
            req.on('error', e => console.error(e))
            req.write(JSON.stringify({ chain_id }))
            req.end()
        } catch (error) {
            console.log('Error: ' + error)
            reject()
        }
    })
}

const reportStatus = async () => {
    try {
        const info = await getInfo()
        const req = https.request(server_url + '/chains/report/status', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, res => res.on('data', d => process.stdout.write(d + '\n')))
        
        req.on('error', e => console.error(e))
        req.write(JSON.stringify(info))
        req.end()
    } catch (error) {
        console.log('Error: ' + error)
    }
}

const getInfo = () => 
    new Promise((resolve, reject) => {
        exec('/home/ubuntu/komodo/src/komodo-cli -ac_name=' + ac_name + ' getinfo', (error, stdout, stderr) => {
            if(error) {
                console.log('ERROR: getinfo failed: ', error)
                reject(error)
            }

            if(stderr) {
                console.log('STDERR: getinfo failed: ', stderr)
                reject(stderr)
            }

            if(stdout) resolve(JSON.parse(stdout))
        })
    });

// Report Stopped Gen
if(action === 'reportStoppedGen') {
    console.log('Will kill stop gen in this instance when block hits 129')

    let time_to_stop = false
    
    let interval = setInterval(async () => {
        if(!time_to_stop) {
            try {
                const info = await getInfo()

                if(info.blocks >= 129) {
                    console.log('Reached block 129')

                    // Stop -gen
                    execSync('/home/ubuntu/komodo/src/komodo-cli -ac_name=' + ac_name + ' setgenerate false')

                    // Report to the server
                    https.get(server_url + '/chains/report/stoppedGen', response => {
                        let data = ''
                        
                        // A chunk of data has been recieved.
                        response.on('data', chunk => { data += chunk })
                    
                        // The whole response has been received. Print out the result.
                        response.on('end', () => {
                            if(JSON.parse(data).status === 0) {
                                console.log('Going regular... Not gen anymore!')
                                
                                // Our message is delivered to server perfectly, can exit this script safely
                                time_to_stop = true
                                clearInterval(interval)
                            }
                        })
                    }).on('error', err => { console.log('Error: ' + err.message) })
                }
            } catch (error) {
                console.log('Error: ' + error)
            }
        }
    }, 5*60*1000)
}

// Send premined coins
else if(action === 'sendPremined') {
    console.log('Will send premined coins when block hits 128')

    let time_to_stop = false
    
    let interval = setInterval(async () => {
        if(!time_to_stop) {
            try {
                const info = await getInfo()

                if(info.blocks >= 128) {
                    console.log('Reached block 128')

                    // Send
                    while(1) {
                        try {
                            execSync('/home/ubuntu/komodo/src/komodo-cli -ac_name=' + ac_name + 
                                    ' sendtoaddress ' + kmd_address + ' ' + ac_supply)
                            
                            console.log('Sent premined coins')
                            
                            // Our message is delivered to server perfectly, can exit this script safely
                            time_to_stop = true
                            clearInterval(interval)
                            break
                        } catch (error) {
                            console.log(error)
                            await sleep(10000)
                        }
                    }
                }
            } catch (error) {
                console.log('Error: ' + error)
            }
        }
    }, 5000)
}

// Report Status
else if(action === 'reportStatus') {
    console.log('Will report status all the time')
    
    reportStatus()
    setInterval(reportStatus, 10*1000)
}

// Save Node Image
else if(action === 'saveNodeImage') {
    console.log('Will report to save node image')
    
    // Extract Komodo Version
    const komodo_cpp = fs.readFileSync('/home/ubuntu/komodo/src/rpc/misc.cpp', 'utf8')
    const komodo_version = komodo_cpp.match('KOMODO_VERSION "(.+)"')[1]
    
    console.log('Komodo Version: ', komodo_version)
    try {
        const req = https.request(server_url + '/chains/report/saveNodeImage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
        }, res => res.on('data', d => process.stdout.write(d + '\n')))
        
        req.on('error', e => console.error(e))
        req.write(JSON.stringify({ database_id, komodo_version }))
        req.end()
    } catch (error) {
        console.log('Error: ' + error)
    }
}







// Allow Port
else if(action === 'allowPort') {
    console.log('Will report port soon')

    let time_to_stop = false
    
    let interval = setInterval(async () => {
        if(!time_to_stop) {
            try {
                const info = await getInfo()
                if(info.p2pport !== undefined) {
                    console.log('Found the p2pport! Enabling it...')
                    
                    execSync('sudo ufw allow ' + info.p2pport)
                    execSync('sudo ufw allow out ' + info.p2pport)
                    execSync('sudo ufw reload')

                    // Can exit this script safely
                    time_to_stop = true
                    clearInterval(interval)
                }
            } catch (error) {
                console.log('Error: ' + error)
            }
        }
    }, 1000)
}


// Wait till 32 before launching up SPV server
else if(action === 'withdrawBalance') {
    (async () => {
        console.log('Will send all balance when requested')

        while(1) {
            await (new Promise(function (resolve, reject) {
                try { 
                    console.log('Checking if awaiting withdraw, Reporting the status')

                    const info = await getInfo()

                    const req = https.request(server_url + '/chains/awaiting_withdraw', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }
                    }, res => res.on('data', data => {
                        let withdrawal 
                        try { withdrawal = JSON.parse(data) } catch (error) { console.log('JSON Parsing error', error) }
                        
                        // If yes,
                        if(withdrawal.status === true) {
                            console.log(`Withdrawing all balance to address`)
                            
                            execSync(`/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} sendtoaddress ${withdrawal.kmd_address} $(/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} getbalance) "" "" true`)
                    
                            console.log('Sent all balance')
                        }
                                
                        resolve()
                    }))
                    
                    req.on('error', e => { console.log(e); resolve() })
                    req.write(JSON.stringify({ miner_status: info }))
                    req.end()
                } catch (error) {
                    console.log('Error: ' + error)
                    resolve()
                }
            }))
            
            await sleep(5000)
        }
    })()
}


// Wait till 32 before launching up SPV server
else if(action === 'launchSPV') {
    (async () => {
        console.log('Will launch up SPV Server when block hits 32')

        while(1) {
            await (new Promise(function (resolve, reject) {
                try { 
                    console.log('Getting awaiting SPV servers')
                    https.get(server_url + '/chains/awaiting_spv_server', response => {
                        let data = ''
                        
                        // A chunk of data has been recieved.
                        response.on('data', chunk => { data += chunk })
                    
                        // The whole response has been received. Print out the result.
                        response.on('end', async () => {
                            let chains 
                            try { chains = JSON.parse(data) } catch (error) { console.log('JSON Parsing error', error) }
                            
                            // Loop all the chains which await for SPV Server setup
                            if(chains !== undefined && Array.isArray(chains)) {
                                console.log(`Found ${chains.length} chains`)
                                for(let c of chains) {
                                    const ticker = c.params_object.ac_name
                                    const p2pport = c.status.p2pport
                                    const rpcport = c.status.rpcport
                                    const tcpport = p2pport-1 // -1 is p2pport
                                    const spv_rpcport = p2pport-2
                                    const name_fixed = '_' + replaceAll(c.params_object.full_name, ' ', '') // Remove spaces

                                    console.log(`Enabling SPV Server for:  ${name_fixed}  ${ticker}  ${rpcport}`)
                                    
                                    // Enable the ports for this chain
                                    execSync('sudo ufw allow ' + p2pport)
                                    execSync('sudo ufw allow out ' + p2pport)
                                    execSync('sudo ufw allow ' + tcpport)
                                    execSync('sudo ufw allow out ' + tcpport)
                                    execSync('sudo ufw reload')

                                    // Add Coin details to the coins.py
                                    let new_coin = `
class ${name_fixed}(KomodoMixin, EquihashMixin, Coin):
    NAME = "${name_fixed}"
    SHORTNAME = "${ticker}"
    NET = "mainnet"
    TX_COUNT = 64
    TX_COUNT_HEIGHT = 32
    TX_PER_BLOCK = 2
    RPC_PORT = ${rpcport}
    REORG_LIMIT = 800
    PEERS = []

`

                                    // Save to coins.y
                                    const spv_folder = `/home/ubuntu/spv-server`
                                    const electrum_folder = `${spv_folder}/electrumx`
                                    const coins_path = `${electrum_folder}/electrumx/lib/coins.py`
                                    let coins = fs.readFileSync(coins_path, 'utf8')
                                    const to_find = '\nclass Komodo('
                                    fs.writeFileSync(coins_path, coins.replace(to_find, new_coin + to_find))
                                    
                                    // Build for new coin in coins.py
                                    console.log('Building electrumx...')
                                    execSync(`cd ${electrum_folder} && sudo python3.6 ${electrum_folder}/setup.py build`)
                                    console.log('Installing electrumx...')
                                    execSync(`cd ${electrum_folder} && sudo python3.6 ${electrum_folder}/setup.py install`)

                                    // Save .conf of komodod
                                    console.log('Saving komodod conf...')
                                    const rpcuser = 'clizard'
                                    const rpcpassword = 'local321'
                                    execSync(`mkdir -p /home/ubuntu/.komodo/${ticker}`)
                                    fs.writeFileSync(`/home/ubuntu/.komodo/${ticker}/${ticker}.conf`, `
rpcuser=${rpcuser}
rpcpassword=${rpcpassword}
rpcport=${rpcport}
server=1
txindex=1
rpcworkqueue=256
rpcallowip=127.0.0.1
`)

                                    // Run komodod for the new chain
                                    console.log('Running komodod...')
                                    exec(`/home/ubuntu/komodo/src/${c.params.replace(' &', '')}`)
                                    
                                    // Wait a little for komodod to start
                                    console.log('Waiting a little bit for komodod to launch properly...')
                                    await sleep(10000)

                                    // More variables
                                    const service_name = `electrumx_${ticker}`
                                    const db_folder = `${spv_folder}/SPV/${ticker}`
                                    const daemon_url = `http://${rpcuser}:${rpcpassword}@localhost:${rpcport}/`
                                    const conf_file = `${spv_folder}/config/electrumx_${ticker}.conf`

                                    // Create the service file and copy it to system
                                    console.log('Saving service file...')
                                    const tmp_file = `${spv_folder}/copy_this`

                                    fs.writeFileSync(tmp_file, fs.readFileSync(`${electrum_folder}/contrib/systemd/electrumx.service`, 'utf8')
                                        .replace('Description=Electrumx', `Description=Electrumx_${ticker}`)
                                        .replace('EnvironmentFile=/etc/electrumx.conf', `EnvironmentFile=${conf_file}`)
                                        .replace('User=electrumx', `User=ubuntu`))

                                    execSync(`sudo cp ${tmp_file} /etc/systemd/system/electrumx_${ticker}.service`)
                                    execSync(`rm ${tmp_file}`)
                                    
                                    // Prepare the DB Folder
                                    execSync(`mkdir -p ${db_folder}`)
                                    
                                    // Save the config file
                                    fs.writeFileSync(conf_file, `
COIN = ${name_fixed}
DB_DIRECTORY = ${db_folder}
DAEMON_URL = ${daemon_url}
SERVICES = tcp://:${tcpport},rpc://:${spv_rpcport}
EVENT_LOOP_POLICY = uvloop
PEER_DISCOVERY = self
`)

                                    // Add SPV cleanup line to crontab
                                    console.log('Adding SPV cleanup to crontab...')
                                    const crontab = `0 5 * * 0 sudo systemctl stop ${service_name} && COIN=${name_fixed} DB_DIRECTORY=${db_folder} ${electrum_folder}/electrumx_compact_history && sudo systemctl start ${service_name}`
                                    execSync(`(crontab -l 2>/dev/null; echo "${crontab}") | crontab -`)

                                    // Reload systemctl daemon 
                                    console.log('Reloading systemctl daemon...')
                                    execSync(`sudo systemctl daemon-reload`)

                                    // Start the server
                                    console.log('Starting SPV server...')
                                    execSync(`sudo systemctl start ${service_name}`)

                                    // Enabled SPV Server for this chain, report to the CL server
                                    let reported = false
                                    while(!reported) {
                                        try {
                                            console.log('Reporting to the server...')
                                            await reportSPVEnabled(c._id)  
                                            reported = true
                                        } catch (error) {
                                            console.log(`Could not report enabling of SPV Server for ${name_fixed} / ${ticker} to the server`)   
                                            console.log('Will try again soon...')
                                            await sleep(20000)
                                        }
                                    }
                                }
                            }
                                    
                            resolve()
                        })
                    }).on('error', err => { 
                        console.log('Error: ' + err.message) 
                        resolve()
                    })
                } catch (error) {
                    console.log('Error: ' + error)
                    resolve()
                }
            }))
            
            await sleep(5000)
        }
    })()
}
