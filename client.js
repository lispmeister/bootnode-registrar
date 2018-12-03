var Web3 = require('web3');
var net = require('net');
var fs = require('fs');
var request = require('request');
var sleep = require('sleep');

function web3Client() {
    this.failCount = 0;
}

web3Client.prototype.Refresh = function () {
    if (this.failCount > 15) {
        throw new Error("Too many exceptions. . . Exiting")
    }

    if (!this._web3) {
        var client = net.Socket();
        var web3 = new Web3(new Web3.providers.IpcProvider(process.env.ETH_IPC_PATH, client));

        web3._extend({
            property: 'geth',
            properties:
            [
                new web3._extend.Property({
                    name: 'nodeInfo',
                    getter: 'admin_nodeInfo',
                    outputFormatter: function (result) {
                        var pattern = /enode\:\/\/([^@]+)@[^:]+:(.+)\?/g;
                        var match = pattern.exec(result);

                        if (match) {
                            console.log("MATCH[1]: " + match[1]);
                            console.log("MATCH[2]: " + match[2]);
                            result = {
                                id: match[1],
                                ports: {
                                    listener: match[2]
                                }
                            }
                        }

                        return result;
                    }
                }),
            ]
        });

        this._web3 = web3
        this.geth = web3.geth;
    }

    this._web3.reset();
}

function updateEnode(url, data, callback) {
    console.log("update enode - " + url);
    request.post(
        url,
        {
            json: data,
            timeout: 1000
        },
        function (error, response, body) {
            var e = error || response.statusCode != 200;

            if (e) {
                console.log(error);
            }
            callback(e, response);
        }
    )
};

function enodeUpdater(web3Client) {
    this.web3 = web3Client;
}

function runLoop(obj, timeout) {
    setTimeout(function () {
        obj.Run(obj);
    }, timeout);
}

function readNode(web3, fn) {
    web3.Refresh();

    web3.geth.getNodeInfo(function (error, result) {
        if (error) {
          console.log("ERROR: web3.geth.getNodeInfo: " + error);
        }
        else
        {
          console.log("RESULT: web3.geth.getNodeInfo.id: " + result.id);
          console.log("RESULT: web3.geth.getNodeInfo.id: " + result.ports.listener);
          fn(error, result);
        }
    });
}

enodeUpdater.prototype.Run = function (obj) {
    var web3 = obj.web3;
    readNode(obj.web3, function (error, result) {
        var timeout = 1000 * 10;
        if (error) {
            web3.failCount++;
            console.log("Fail count: " + web3.failCount + " " + error);
            runLoop(obj, 500);
        }
        else {
            var listenPort = result.ports.listener;
            if (!listenPort)
            {
                listenPort = 30303;
            }

            var data = {
                enode: result.id,
                port: listenPort,
                ip: process.env.HOST_IP,
                publicIp: process.env.BOOTNODE_PUBLIC_IP,
                network: process.env.BOOTNODE_NETWORK,
                miner: false || process.env.ENABLE_MINER
            }
            updateEnode(process.env.BOOTNODE_URL, data, function (err, result) {
                if (err) {
                    runLoop(obj, 1000 * 3);
                }
                else {
                    console.log(data);
                    runLoop(obj, 1000 * 15);
                }
            });
        }
    });
};


if (process.env.ETH_IPC_PATH) {
    ipcPath = process.env.ETH_IPC_PATH;
}

if (process.env.BOOTNODE_URL) {
    var client = new web3Client();
    var enode = new enodeUpdater(client);
    enode.Run(enode);
}
else {
    console.log("No BOOTNODE_URL,BOOTNODE_NETWORK or BOOTNODE_PUBLIC_IP provided");
}
