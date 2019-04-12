// Put this file to home folder of the instance

console.log('Starting instance script...')

const exec = require('child_process').exec
const execSync = require('child_process').execSync
const https = require('https')

const ac_name = process.argv[2]
const action = process.argv[3]
const server_url = process.argv[4] || '' // Needs to end with / because the action will be appended as endpoint
const database_id = process.argv[5] || '' 

const reportStatus = async () => {
    try {
        const info = await getInfo()
        const req = https.request(server_url + '/api/chains/report/status', {
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
    console.log('Will kill this intance when block hits 128')

    let time_to_stop = false
    
    let interval = setInterval(async () => {
        if(!time_to_stop) {
            try {
                const info = await getInfo()

                if(info.blocks === 128) {
                    console.log('Reached block 128')

                    // Stop -gen
                    execSync('/home/ubuntu/komodo/src/komodo-cli -ac_name=' + ac_name + ' setgenerate false')

                    // Report to the server
                    https.get(server_url + '/api/chains/report/stoppedGen', response => {
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
    const komodo_cpp = require('fs').readFileSync('/home/ubuntu/komodo/src/rpc/misc.cpp', 'utf8')
    const komodo_version = komodo_cpp.match('KOMODO_VERSION "(.+)"')[1]
    
    console.log('Komodo Version: ', komodo_version)
    try {
        const req = https.request(server_url + '/api/chains/report/saveNodeImage', {
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
