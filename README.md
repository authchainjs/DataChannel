# DataChannel

WebRTC DataChannel for "many-to-many" peers connection

> This "DataChannel" library is derivation of original work ([DataChannel.js](https://github.com/muaz-khan/WebRTC-Experiment/blob/master/DataChannel/DataChannel.js)) of [Muaz Khan](https://github.com/muaz-khan)

----

## Usage

```javascript
const preStoredUserId = 'your-user-id'

AuthChainJSDataChannel.Config({
    // preferred signaling server (fallback to backnodes list [case have])
    server: 'wss://server-signaling-address',
    debug: true
}).then((DataChannel) => {
    /**
    `{Object}` DataChannel: {
        channel: {Object}, DataChannel object
        server:  {String}, Valid server signaling
        pool:    {String}  Pool of channel (remember: max 256 peers by pool)
     }
     */

    const CHANNEL = new DataChannel.channel(DataChannel.pool, preStoredUserId)

    CHANNEL.openSignalingChannel = function(config) {
        config.channel = config.channel || this.channel
        let websocket = new WebSocket(DataChannel.server)
        websocket.channel = config.channel
        websocket.onopen = function() {
            websocket.push(JSON.stringify({
                open: true,
                channel: config.channel
            }))
            if ( config.callback ) {
                config.callback(websocket)
            }
        }
        websocket.onmessage = function(event) {
            try {
                config.onmessage(JSON.parse(event.data))
            } catch(e) {} // silent fail for non `JSON` data (failed "parse")
        }
        websocket.push = websocket.send
        websocket.send = function(data) {
            websocket.push(JSON.stringify({
                data: data,
                channel: config.channel
            }))
        }
    }
    
    // create your channel
    CHANNEL.open()
    
    // searching for existing channels
    CHANNEL.connect()
    
    // events --------------------------------
    
    CHANNEL.ondatachannel = function(channel00) { // "ondatachannel" is fired for each new data channel found
        CHANNEL.join(channel00) // join on this new channel discovered
    }
    CHANNEL.onopen = function() {} // when the connection between the pairs is established (after the `.join()`)
    CHANNEL.onmessage = function(data, userid, latency) {} // receive message (latency measure in 'ms')
    CHANNEL.onleave = function(userid) {} // detect users left
    CHANNEL.onerror = function(event) {} // error to open data ports
    CHANNEL.onclose = function(event) {} // data ports suddenly dropped
    
    // methods -------------------------------
    
    CHANNEL.leave() // close your own entire data session (left)
    CHANNEL.eject(userid)  // throw a user out of your channel
    CHANNEL.send(message) // broadcast message to all users in your channel
    CHANNEL.channels[userid].send(message) // direct message for an user in your channel

}).catch(e => {
    throw new Error(e)
})
```

## Todo

Many things to do ... a listing will be created later


## Contrinution

Your contribution to this code will be welcomed, please see the [contribution guide](https://github.com/authchainjs/DataChannel/blob/master/CONTRIBUTING.md)


## Thanks

This work is only possible thanks to the use of open source librarie [DataChannel.js](https://github.com/muaz-khan/WebRTC-Experiment/blob/master/DataChannel/DataChannel.js) written by [Muaz Khan](https://github.com/muaz-khan)


## License

This source code is licensed under [The MIT License (MIT)](LICENSE)

If you believe that the other sources (of third parties) may contain a conflict with this license please contact us in this email: [authchainjs@gmail.com](mailto:authchainjs@gmail.com?subject=LICENSE)
