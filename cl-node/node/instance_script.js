// Put this file to home folder of the instance

const fs = require('fs')

console.log('Starting instance script...')

const exec = require('child_process').exec
const execSync = require('child_process').execSync
const https = require('https')

const download = function(url, dest, cb) {
    console.log(`Will download ${url} to ${dest}...`)
    let file = fs.createWriteStream(dest);
    let request = https.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(cb);  // close() is async, call cb after close completes.
            console.log("Download complete!")
        });
    }).on('error', function(err) { // Handle errors
        console.log("Error at download!")
        fs.unlink(dest); // Delete the file async. (But we don't check the result)
        if (cb) cb(err);
    });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const replaceAll = (string, search, replacement) => string.split(search).join(replacement)

const ac_name = process.argv[2]
const action = process.argv[3]
const server_url = process.argv[4] || '' // Needs to end with / because the action will be appended as endpoint
const database_id = process.argv[5] || '' 
const kmd_address = process.argv[6] || '' 

const prepare_coins_py = (name_fixed, ticker, rpcport) => `
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
const komodo_version_file_path = '/home/ubuntu/komodo_version.txt'
const getKomodoVersion = () => fs.readFileSync(komodo_version_file_path, 'utf8')

const reportSPV =  (chain_id, spv_status) => {
    return new Promise(function (resolve, reject) {
        try {
            const req = https.request(server_url + '/chains/report/spv' + spv_status, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }
            }, res => res.on('data', d => {
                process.stdout.write(d + '\n')
                try {
                    let parsed = JSON.parse(d)
                    if(parsed !== undefined && parsed.status === 0) resolve()
                    else reject()
                } catch (error) {
                    console.log('reportSPV parse failed', error)
                    reject()
                }
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

            if(stdout) {
                let parsed
                try {
                    parsed = JSON.parse(stdout)
                } catch (error) {
                    console.log('Failed to parse getInfo: ', error)
                }

                resolve(parsed || {})
            }
        })
    });

// Send premined coins
if(action === 'sendPremined') {
    console.log('Will send premined coins when block hits 128')

    let time_to_stop = false
    
    let interval = setInterval(async () => {
        if(!time_to_stop) {
            try {
                const info = await getInfo()

                if(info.blocks >= 128) {
                    console.log('Reached block 128')

                    // Send
                    try {
                        execSync(`/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} sendtoaddress ${kmd_address} $(/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} getbalance) "" "" true`)
                        
                        console.log('Sent premined coins')
                        
                        // Our message is delivered to server perfectly, can exit this script safely
                        time_to_stop = true
                        clearInterval(interval)
                    } catch (error) {
                        console.log(error)
                        await sleep(10000)
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
    const komodo_version = getKomodoVersion()
    
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



// Wait till 32 before launching up SPV server
else if(action === 'updateKomodoVersion') {
    (async () => {
        console.log('Will update Komodo if version changes')
        
        while(1) {
            await (new Promise(function (resolve, reject) {
                try { 
                    console.log('Getting version from the server')
                    https.get(server_url + '/chains/get_komodo_version/' + ac_name, response => {
                        let data = ''
                        
                        // A chunk of data has been recieved.
                        response.on('data', chunk => { data += chunk })
                    
                        // The whole response has been received. Print out the result.
                        response.on('end', async () => {
                            let update_info 
                            try { update_info = JSON.parse(data) } catch (error) { console.log('JSON Parsing error', error) }
                            
                            try {
                                // Loop all the chains which await for SPV Server setup
                                if(update_info !== undefined) {
                                    let KMDversion = update_info.KMDversion
                                    console.log(`Version at the server: ` + KMDversion)

                                    // Extract local Komodo Version
                                    const local_komodo_version = getKomodoVersion()
                                    console.log(`Local version: ` + local_komodo_version)

                                    if(local_komodo_version === KMDversion) {
                                        console.log("Version is same, no need to update")
                                        resolve()
                                    }
                                    else {
                                        // Update is required
                                        console.log(`Update from ${local_komodo_version} to ${KMDversion} is required`)
                                        
                                        const file_name = `${KMDversion}.sh`
                                        const update_script_path = `/home/ubuntu/${file_name}`
                                        download(`https://raw.githubusercontent.com/KomodoPlatform/depot/master/cl-node/node/komodod_updates/${file_name}`, update_script_path, (err) => {
                                            if(err) throw err
                                            
                                            try {
                                                // File downloaded successfully
                                                console.log("Update file downloaded successfully")
                                                console.log("Running the update script...")
                                                execSync(`sudo bash ${update_script_path}`)
                                                console.log("Completed the update script")

                                                // Update the version file
                                                console.log("Updating the local version file")
                                                fs.writeFileSync(komodo_version_file_path, `${KMDversion}`)
                                                
                                                console.log("Rebooting the server...")
                                                execSync(`sudo reboot`)

                                                resolve()
                                            } catch (error) {
                                                console.log('Error: ' + error)
                                                resolve()
                                            }
                                        })
                                    }
                                }
                                else {
                                    console.log("Undefined update info!")
                                    resolve()
                                }
                            } catch (err) {
                                console.log('Error: ' + err.message) 
                                resolve()
                            }
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


else if(action === 'withdrawBalance') {
    (async () => {
        console.log('Will send all balance when requested')

        while(1) {
            await (new Promise(async (resolve, reject) => {
                try { 
                    console.log('Checking if awaiting withdraw, Reporting the status')
                    
                    const info = await getInfo()

                    if(info.blocks >= 129) {
                        const req = https.request(server_url + '/chains/awaiting_withdraw', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }
                        }, res => res.on('data', data => {
                            let withdrawal 
                            try { withdrawal = JSON.parse(data) } catch (error) { console.log('JSON Parsing error', error) }
                            
                            try {
                                // If yes,
                                if(withdrawal !== undefined && withdrawal.status === true) {
                                    let withdraw_all_balance_now = false
                                    
                                    if(withdrawal.action === 'start_gen') {
                                        // setgenerate true
                                        execSync(`/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} setgenerate true -1`)
                                        // Add -gen to crontab
                                        execSync(`crontab -l | sed -e 's/\-addnode/\-gen \-addnode/g' | crontab -`)

                                        console.log('Started gen')
                                    }
                                    else if(withdrawal.action === 'stop_gen') {
                                        // setgenerate false
                                        execSync(`/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} setgenerate false`)
                                        // Remove -gen from crontab
                                        execSync(`crontab -l | sed -e 's/\-gen //g' | crontab -`)

                                        console.log('Stopped gen')

                                        // Withdraw all at stop gen
                                        withdraw_all_balance_now = true
                                    }
                                    
                                    // Withdraw when requested, or when gen stops
                                    if(withdrawal.action === 'withdraw' || withdraw_all_balance_now) {
                                        console.log(`Withdrawing all balance to address`)
                                        
                                        let curr_balance = 1
                                        let amount_to_send = undefined
                                        while(curr_balance >= 1 && (!amount_to_send || amount_to_send >= 1)) {
                                            curr_balance = parseFloat(execSync(`/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} getbalance`))
                                            if(!amount_to_send) amount_to_send = curr_balance
    
                                            if(curr_balance >= 1 && amount_to_send >= 1) {
                                                console.log('Current balance: ' + curr_balance)
    
                                                try {
                                                    const cmd = `/home/ubuntu/komodo/src/komodo-cli -ac_name=${ac_name} sendtoaddress ${withdrawal.kmd_address} ${amount_to_send.toFixed(8)} "" "" true`
                                                    console.log(cmd)
                                                    execSync(cmd)
                                                } catch (error) {
                                                    console.log('Failed to send: ' + error)
                                                    console.log('Halving the amount, will try again: ' + error)
                                                    amount_to_send *= 0.5
                                                }
                                            }
                                        }
                                
                                        console.log(`Sent all balance (${info.balance}) to ${withdrawal.kmd_address}`)
                                    }
                                }
                            } catch (error) { console.log('Failed at sendtoaddress', error) }
                            
                            resolve()
                        }))
                        
                        req.on('error', e => { console.log(e); resolve() })
                        req.write(JSON.stringify({ miner_status: info }))
                        req.end()
                    }
                    else resolve()
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
                            
                            try {
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
                                        let new_coin = prepare_coins_py(name_fixed, ticker, rpcport)

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
                                        const komodod_start_line = `/home/ubuntu/komodo/src/${c.params.replace(' &', '')}`
                                        exec(komodod_start_line)
                                        execSync(`(crontab -l 2>/dev/null; echo "@reboot ${komodod_start_line}") | crontab -`)
                                        
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
                                        execSync(`sudo systemctl --now enable ${service_name}`)

                                        // Enabled SPV Server for this chain, report to the CL server
                                        let reported = false
                                        while(!reported) {
                                            try {
                                                console.log('Reporting to the server...')
                                                await reportSPV(c._id, 'Enabled')  
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
                            } catch (err) {
                                console.log('Error: ' + err.message) 
                                resolve()
                            }
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
            
            await sleep(30000)
        }
    })()
}




// Wait till 32 before launching up SPV server
else if(action === 'removeSPV') {
    (async () => {
        console.log('Will Remove SPV Servers')

        while(1) {
            await (new Promise(function (resolve, reject) {
                try { 
                    console.log('Getting awaiting SPV servers')
                    https.get(server_url + '/chains/awaiting_spv_server_removal', response => {
                        let data = ''
                        
                        // A chunk of data has been recieved.
                        response.on('data', chunk => { data += chunk })
                    
                        // The whole response has been received. Print out the result.
                        response.on('end', async () => {
                            let chains 
                            try { chains = JSON.parse(data) } catch (error) { console.log('JSON Parsing error', error) }
                            try {
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

                                        console.log(`Disabling SPV Server for:  ${name_fixed}  ${ticker}  ${rpcport}`)
                                        
                                        // Enable the ports for this chain
                                        execSync('sudo ufw delete allow ' + p2pport)
                                        execSync('sudo ufw delete allow out ' + p2pport)
                                        execSync('sudo ufw delete allow ' + tcpport)
                                        execSync('sudo ufw delete allow out ' + tcpport)
                                        execSync('sudo ufw reload')

                                        // Remove Coin details from the coins.py
                                        let new_coin = prepare_coins_py(name_fixed, ticker, rpcport)

                                        // Save to coins.y
                                        const spv_folder = `/home/ubuntu/spv-server`
                                        const electrum_folder = `${spv_folder}/electrumx`
                                        const coins_path = `${electrum_folder}/electrumx/lib/coins.py`
                                        let coins = fs.readFileSync(coins_path, 'utf8')
                                        fs.writeFileSync(coins_path, coins.replace(new_coin, ''))
                                        
                                        // Build for new coin in coins.py
                                        console.log('Building electrumx...')
                                        execSync(`cd ${electrum_folder} && sudo python3.6 ${electrum_folder}/setup.py build`)
                                        console.log('Installing electrumx...')
                                        execSync(`cd ${electrum_folder} && sudo python3.6 ${electrum_folder}/setup.py install`)
                                        
                                        // Stop komodod for the new chain
                                        const komodod_clean_line = `/home/ubuntu/komodo/src/${c.params.replace(' &', '')}`
                                        console.log('Stopping komodod...')
                                        exec(`sudo pkill -f "${komodod_clean_line}"`)

                                        // Remove komodod line from crontab
                                        try {
                                            console.log('Removing komodod line from crontab...')
                                            execSync(`crontab -l | grep -v '${komodod_clean_line}' | crontab -`)       
                                        } catch (error) {
                                            console.log('Could not remove komodod line from crontab, but it is okay')
                                        }

                                        // Delete .conf of komodod
                                        console.log('Deleting komodod conf...')
                                        try {
                                            execSync(`sudo rm -rf /home/ubuntu/.komodo/${ticker}`)
                                            execSync(`sudo rm -rf /home/ubuntu/${ticker}_7776`)
                                        } catch (error) {
                                            console.log('Error at delete komodod conf!')
                                            console.log(error)
                                        }

                                        // More variables
                                        const rpcuser = 'clizard'
                                        const rpcpassword = 'local321'
                                        const service_name = `electrumx_${ticker}`
                                        const db_folder = `${spv_folder}/SPV/${ticker}`
                                        const daemon_url = `http://${rpcuser}:${rpcpassword}@localhost:${rpcport}/`
                                        const conf_file = `${spv_folder}/config/electrumx_${ticker}.conf`

                                        
                                        // Remove the DB Folder
                                        console.log('Removing db folder: ' + db_folder)
                                        execSync(`sudo rm -rf ${db_folder}`)
                                        
                                        // Remove the config file
                                        console.log('Removing config file: ' + conf_file)
                                        execSync(`sudo rm -rf ${conf_file}`)

                                        // Stop the server
                                        console.log('Stop SPV server...')
                                        try {
                                            execSync(`sudo systemctl --now disable ${service_name}`)
                                        } catch (error) {
                                            if(error.message.indexOf('not loaded') !== -1 ||
                                               error.message.indexOf('No such file or directory') !== -1) {
                                                // Not an error
                                                console.log('Not an error!')
                                            }
                                            else {
                                                console.log('Should stop...')
                                                throw error
                                            }
                                        }
                                        
                                        // Create the service file and copy it to system
                                        console.log('Removing service file...')

                                        execSync(`sudo rm -rf /etc/systemd/system/electrumx_${ticker}.service`)

                                        // Remove SPV cleanup line from crontab
                                        console.log('Removing SPV cleanup from crontab...')
                                        execSync(`crontab -l | grep -v 'systemctl stop ${service_name} && COIN=${name_fixed}' | crontab -`)

                                        // Reload systemctl daemon 
                                        console.log('Reloading systemctl daemon...')
                                        execSync(`sudo systemctl daemon-reload`)

                                        // Enabled SPV Server for this chain, report to the CL server
                                        let reported = false
                                        while(!reported) {
                                            try {
                                                console.log('Reporting to the server...')
                                                await reportSPV(c._id, 'Disabled')  
                                                reported = true
                                            } catch (error) {
                                                console.log(`Could not report disabling of SPV Server for ${name_fixed} / ${ticker} to the server`)   
                                                console.log('Will try again soon...')
                                                await sleep(20000)
                                            }
                                        }
                                    }
                                }
                                        
                                resolve()
                            } catch (err) {
                                console.log('Error: ' + err.message) 
                                resolve()
                            }
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
