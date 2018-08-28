/**
 * This "DataChannel" library is derivation of original work of Muaz Khan [www.muazkhan.com]:
 *   -- @see                                    - [https://github.com/muaz-khan/WebRTC-Experiment/blob/master/DataChannel/DataChannel.js]
 *   -- @copyright Copyright (c) 2017 Muaz Khan - [https://github.com/muaz-khan]
 *   -- @license The MIT License (MIT)          - [https://github.com/muaz-khan/WebRTC-Experiment/blob/master/LICENSE]
 *
 * This derivation:
 *   -- @copyright Copyright (c) 2018 Lauro Moraes - [https://github.com/subversivo58]
 *   -- @license The MIT License (MIT)             - [https://github.com/authchainjs/DataChannel/blob/master/LICENSE]
 *   -- @version 0.1.0 [development stage]         - [https://github.com/authchainjs/DataChannel/blob/master/VERSIONING.md]
 */

/**
 * UMD (Universal Module Definition) [improved]
 */
;((root, factory) => {
    // ...
    if ( typeof define === 'function' && define.amd ) {
        define(['exports'], factory)
    } else if ( typeof exports !== 'undefined' ) {
        factory(exports)
    } else {
        factory(root)
    }
})(this, exports => {
    'use strict'
    /**
     * Define execution context (web only)[not Node environment or others][not frameable]
     * -- Browser Context    - main browser (window and document access)
     * -- Web Worker Context - thread       (WorkerGlobalWorkerScope access, don't access ServiceWorkerGlobalScope)
     * -- Service Worker     - proxy        (access WorkerGlobalWorkerScope and ServiceWorkerGlobalScope)
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/self
     *
     *   -- "The Window.self read-only property returns the window itself, as a WindowProxy.
     *       It can be used with dot notation on a window object (that is, window.self) or standalone (self).
     *       The advantage of the standalone notation is that a similar notation exists for non-window contexts, such as in Web Workers.
     *       By using self, you can refer to the global scope in a way that will work not only in a window context (self will resolve to window.self)
     *       but also in a worker context (self will then resolve to WorkerGlobalScope.self)."
     */
    let IsServiceWorkerContext = ( ('WorkerGlobalScope' in self) && ('ServiceWorkerGlobalScope' in self) ) ? true : false,
        IsWebWorkerContext     = ( ('WorkerGlobalScope' in self) && !('ServiceWorkerGlobalScope' in self) ) ? true : false,
        IsWebBrowserContext    = ( ('window' in self && 'document' in self) && !IsServiceWorkerContext && !IsWebWorkerContext) ? true : false

    /**
     * global constant's (aka: variables) [imutables]
     */
    const noop = () => {}
    const getRandomString = () => {
        return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '-')
    }
    const uniqueToken = () => {
        return (Math.round(Math.random() * 60535) + 5000000).toString()
    }
    const wd = IsWebBrowserContext ? window : self,
        nv = wd.navigator,
        ua = nv.userAgent,
        ls = IsWebBrowserContext ? wd.localStorage : noop(),
        ss = IsWebBrowserContext ? wd.sessionStorage : noop(),
        moz = !!nv.mozGetUserMedia,
        IsDataChannelSupported = !((moz && !nv.mozGetUserMedia) || (!moz && !nv.webkitGetUserMedia)),
        isChrome = !!nv.webkitGetUserMedia,
        isFirefox = !!nv.mozGetUserMedia,
        // @REVISE: experimental
        ip_dups = {}

    /**
     * global variables (in scope) [mutables]
     */
    let alreadyInstancied = false,   // protect plugin instance
        firstInstance = Date.now(),  // allow first instance of plugin
        chromeVersion = 50,
        Debug

    if ( isChrome ) {
        chromeVersion = !!nv.mozGetUserMedia ? 0 : parseInt(nv.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2])
    }

    const DataChannel = function(channel, userid) {
        if ( (!channel || typeof channel !== 'string') || (!userid || typeof userid !== 'string') ) {
            throw new Error('[AuthChainDataChannel]: "DataChannel" requires two params has `{String}`: channel name and user id')
        }

        this.channel   = channel
        this.userid    = userid

        let self = this,
            dataConnector,
            textReceiver

        this.onmessage = function(message, userid) {
            Debug(`[AuthChainDataChannel]: ${userid}`, 'sent message:', message)
        }

        this.channels = {}

        this.onopen = function(userid) {
            Debug(`[AuthChainDataChannel]: ${userid}`, 'is connected with you.')
        }

        this.onclose = function(event) {
            Debug('[AuthChainDataChannel]: data channel closed:', event)
        }

        this.onerror = function(event) {
            Debug('[AuthChainDataChannel]: data channel error:', event)
        }

        function init() {
            if ( self.config ) {
                return
            }

            self.config = {
                ondatachannel(room) {
                    if ( !dataConnector ) {
                        self.room = room
                        return
                    }

                    let tempRoom = {
                        id: room.roomToken,
                        owner: room.broadcaster,
                        credential: self.credential
                    }

                    if ( self.ondatachannel ) {
                        return self.ondatachannel(tempRoom)
                    }

                    if ( self.joinedARoom ) {
                        return
                    }

                    self.joinedARoom = true

                    self.join(tempRoom)
                },
                onopen(userid, _channel) {
                    self.onopen(userid, _channel)
                    self.channels[userid] = {
                        channel: _channel,
                        send(data) {
                            self.send(data, this.channel)
                        }
                    }
                },
                onmessage(data, userid) {
                    data = JSON.parse(data)

                    if ( data.type === 'text' ) {
                        textReceiver.receive(data, self.onmessage, userid)
                    } else {
                        self.onmessage(data, userid)
                    }
                },
                onclose(event) {
                    let myChannels = self.channels,
                        closedChannel = event.currentTarget

                    for (let userid in myChannels) {
                        if ( closedChannel === myChannels[userid].channel ) {
                            delete myChannels[userid]
                        }
                    }

                    self.onclose(event)
                },
                openSignalingChannel: self.openSignalingChannel
            }

            dataConnector = new DataConnector(self, self.config)

            textReceiver = new TextReceiver(self)

            if ( self.room ) {
                self.config.ondatachannel(self.room)
            }
        }

        this.open = function(_channel) {
            self.joinedARoom = true

            if ( self.socket ) {
                self.socket.onDisconnect().remove()
            } else {
                self.isInitiator = true
            }

            if ( _channel ) {
                self.channel = _channel
            }

            init()
            dataConnector.createRoom(_channel)
        }

        this.connect = function(_channel, callback) {
            if ( _channel ) {
                self.channel = _channel
            }
            init()
        }

        // manually join a room
        this.join = function(room) {
            if ( !room.id || !room.owner ) {
                throw 'Invalid room info passed.'
            }

            if ( !dataConnector ) {
                init()
            }

            if ( !dataConnector.joinRoom ) {
                return
            }

            dataConnector.joinRoom({
                roomToken: room.id,
                joinUser: room.owner
            })
        }

        this.send = function(data, _channel) {
            if ( !data ) {
                throw '[AuthChainDataChannel]: No file, data or text message to share.'
            }
            TextSender.send({
                text: data,
                channel: dataConnector,
                _channel: _channel,
                base: self
            })
        }

        this.onleave = function(userid) {
            Debug(userid, 'left!')
        }

        this.leave = this.eject = function(userid) {
            dataConnector.leave(userid, self.autoCloseEntireSession)
        }

        this.openNewSession = function(isOpenNewSession, isNonFirebaseClient) {
            if ( isOpenNewSession ) {
                if ( self.isNewSessionOpened ) {
                    return
                }
                self.isNewSessionOpened = true

                if ( !self.joinedARoom ) {
                    self.open()
                }
            }

            if ( !isOpenNewSession || isNonFirebaseClient ) {
                self.connect()
            }

            if ( !isNonFirebaseClient ) {
                return
            }

            self.openNewSession(true)
        }

        if ( typeof this.preferSCTP === 'undefined' ) {
            this.preferSCTP = isFirefox || chromeVersion >= 32 ? true : false;
        }

        if ( typeof this.chunkSize === 'undefined' ) {
            this.chunkSize = isFirefox || chromeVersion >= 32 ? 13 * 1000 : 1000 // 1000 chars for RTP and 13000 chars for SCTP
        }

        if ( typeof this.chunkInterval === 'undefined' ) {
            this.chunkInterval = isFirefox || chromeVersion >= 32 ? 100 : 500    // 500ms for RTP and 100ms for SCTP
        }
    }

    const DataConnector = function(base, config) {

        let self = {},
            that = this

        self.userToken = (base.userid = base.userid || uniqueToken()).toString()
        self.sockets = []
        self.socketObjects = {}

        let channels = '--',
            isbroadcaster = false,
            isGetNewRoom = true,
            rtcDataChannels = []

        let defaultSocket = base.openSignalingChannel({
            onmessage(response) {
                if ( response.userToken === self.userToken ) {
                    return
                }

                if ( isGetNewRoom && response.roomToken && response.broadcaster ) {
                    config.ondatachannel(response)
                }

                if ( response.newParticipant ) {
                    onNewParticipant(response.newParticipant)
                }

                if ( response.userToken && response.joinUser === self.userToken && response.participant && channels.indexOf(response.userToken) === -1 ) {
                    channels += response.userToken + '--'

                    Debug('[AuthChainDataChannel]: Data connection is being opened between you and', response.userToken || response.channel)
                    newPrivateSocket({
                        isofferer: true,
                        channel: response.channel || response.userToken,
                        closeSocket: true
                    })
                }
            },
            callback(socket) {
                defaultSocket = socket
            }
        })

        function newPrivateSocket(_config) {
            let socketConfig = {
                channel: _config.channel,
                onmessage: socketResponse,
                onopen() {
                    if ( isofferer && !peer ) {
                        initPeer()
                    }

                    _config.socketIndex = socket.index = self.sockets.length
                    self.socketObjects[socketConfig.channel] = socket
                    self.sockets[_config.socketIndex] = socket
                }
            }

            socketConfig.callback = function(_socket) {
                socket = _socket
                socketConfig.onopen()
            }

            let socket = base.openSignalingChannel(socketConfig),
                isofferer = _config.isofferer,
                gotstream,
                inner = {},
                peer,

                peerConfig = {
                    onICE(candidate) {
                        if ( !socket ) {
                            // loop
                            return setTimeout(() => {
                                peerConfig.onICE(candidate)
                            }, 100) // original: 2000
                        }

                        socket.send({
                            userToken: self.userToken,
                            candidate: {
                                sdpMLineIndex: candidate.sdpMLineIndex,
                                candidate: JSON.stringify(candidate.candidate)
                            }
                        })
                    },
                    onopen: onChannelOpened,
                    onmessage(event) {
                        config.onmessage(event.data, _config.userid)
                    },
                    onclose: config.onclose,
                    onerror: base.onerror,
                    preferSCTP: base.preferSCTP
                }

            function initPeer(offerSDP) {
                if ( !offerSDP ) {
                    peerConfig.onOfferSDP = sendsdp
                } else {
                    peerConfig.offerSDP = offerSDP
                    peerConfig.onAnswerSDP = sendsdp
                }

                peer = new RTCPeerConnection(peerConfig)
            }

            function onChannelOpened(channel) {
                channel.peer = peer.peer
                rtcDataChannels.push(channel)

                config.onopen(_config.userid, channel)

                if ( isbroadcaster && channels.split('--').length > 3 && defaultSocket ) {
                    defaultSocket.send({
                        newParticipant: socket.channel,
                        userToken: self.userToken
                    })
                }

                wd.isFirstConnectionOpened = gotstream = true
            }

            function sendsdp(sdp) {
                sdp = JSON.stringify(sdp)
                let part = parseInt(sdp.length / 3),

                    firstPart = sdp.slice(0, part),
                    secondPart = sdp.slice(part, sdp.length - 1),
                    thirdPart = ''

                if ( sdp.length > part + part ) {
                    secondPart = sdp.slice(part, part + part)
                    thirdPart = sdp.slice(part + part, sdp.length)
                }

                socket.send({
                    userToken: self.userToken,
                    firstPart: firstPart
                })

                socket.send({
                    userToken: self.userToken,
                    secondPart: secondPart
                })

                socket.send({
                    userToken: self.userToken,
                    thirdPart: thirdPart
                })
            }

            function socketResponse(response) {
                if ( response.userToken === self.userToken ) {
                    return
                }

                if ( response.firstPart || response.secondPart || response.thirdPart ) {
                    if ( response.firstPart ) {
                        // sdp sender's user id passed over "onopen" method
                        _config.userid = response.userToken

                        inner.firstPart = response.firstPart
                        if ( inner.secondPart && inner.thirdPart ) {
                            selfInvoker()
                        }
                    }
                    if ( response.secondPart ) {
                        inner.secondPart = response.secondPart
                        if ( inner.firstPart && inner.thirdPart ) {
                            selfInvoker()
                        }
                    }

                    if ( response.thirdPart ) {
                        inner.thirdPart = response.thirdPart
                        if ( inner.firstPart && inner.secondPart ) {
                            selfInvoker()
                        }
                    }
                }

                if ( response.candidate && !gotstream && peer ) {
                    if ( !inner.firstPart || !inner.secondPart || !inner.thirdPart ) {
                        return setTimeout(() => {
                            socketResponse(response)
                        }, 100) // original: 400
                    }

                    peer.addICE({
                        sdpMLineIndex: response.candidate.sdpMLineIndex,
                        candidate: JSON.parse(response.candidate.candidate)
                    })

                    Debug('[AuthChainDataChannel]: ice candidate', response.candidate.candidate)
                }

                if ( response.left ) {
                    if ( peer && peer.peer ) {
                        peer.peer.close()
                        peer.peer = null
                    }

                    if ( response.closeEntireSession ) {
                        leaveChannels()
                    } else if ( socket ) {
                        socket.send({
                            left: true,
                            userToken: self.userToken
                        })
                        socket = null
                    }

                    base.onleave(response.userToken)
                }

                if ( response.playRoleOfBroadcaster ) {
                    //setTimeout(function() {
                        self.roomToken = response.roomToken
                        base.open(self.roomToken)
                        self.sockets = swap(self.sockets)
                    //}, 100); // original: 600
                }
            }

            let invokedOnce = false

            function selfInvoker() {
                if ( invokedOnce ) {
                    return
                }

                invokedOnce = true
                inner.sdp = JSON.parse(inner.firstPart + inner.secondPart + inner.thirdPart)

                // Rewrite SDP "badwith" rule (default: 30 rewrite to 0)
                ;(function() {
                    let lines = []
                    inner.sdp.sdp.toString().split('\n').forEach((line, i, array) => {
                        if ( line.indexOf("b") === 0 ) {
                            line = 'b=AS:0'
                        }
                        lines.push(line)
                        if ( i === array.length -1 ) {
                            inner.sdp.sdp = lines.join('\n')
                        }
                    })
                })();

                if ( isofferer ) {
                    peer.addAnswerSDP(inner.sdp)
                } else {
                    initPeer(inner.sdp)
                }

                Debug('sdp', inner.sdp.sdp)
            }
        }

        function onNewParticipant(channel) {
            if ( !channel || channels.indexOf(channel) !== -1 || channel === self.userToken ) {
                return
            }

            channels += channel + '--'

            let newChannel = uniqueToken()

            newPrivateSocket({
                channel: newChannel,
                closeSocket: true
            })

            if ( !defaultSocket ) {
                return
            }

            defaultSocket.send({
                participant: true,
                userToken: self.userToken,
                joinUser: channel,
                channel: newChannel
            })
        }

        function leaveChannels(channel) {
            let alert = {
                left: true,
                userToken: self.userToken
            },
            socket

            // if room initiator is leaving the room; close the entire session
            if ( isbroadcaster ) {
                if ( base.autoCloseEntireSession ) {
                    alert.closeEntireSession = true
                } else {
                    if ( self.sockets[0] ) {
                        self.sockets[0].send({
                            playRoleOfBroadcaster: true,
                            userToken: self.userToken,
                            roomToken: self.roomToken
                        })
                    }
                }
            }

            if ( !channel ) {
                // closing all sockets
                let sockets = self.sockets,
                    length = sockets.length

                for (let i = 0; i < length; i++) {
                     socket = sockets[i]
                     if ( socket ) {
                         socket.send(alert);

                         if ( self.socketObjects[socket.channel] ) {
                             delete self.socketObjects[socket.channel]
                         }

                         delete sockets[i]
                     }
                }

                that.left = true
            }

            // eject a specific user!
            if ( channel ) {
                socket = self.socketObjects[channel]
                if ( socket ) {
                    socket.send(alert)

                    if ( self.sockets[socket.index] ) {
                        delete self.sockets[socket.index]
                    }

                    delete self.socketObjects[channel]
                }
            }
            self.sockets = swap(self.sockets)
        }

        wd.addEventListener('beforeunload', function() {
            leaveChannels()
        }, false)

        wd.addEventListener('keydown', function(e) {
            if ( e.keyCode === 116 ) {
                leaveChannels()
            }
        }, false)

        return {
            createRoom(roomToken) {
                self.roomToken = (roomToken || uniqueToken()).toString()

                isbroadcaster = true
                isGetNewRoom = false

                ;(function transmit() {
                    if ( defaultSocket ) {
                        defaultSocket.send({
                            roomToken: self.roomToken,
                            broadcaster: self.userToken
                        })
                    }

                    if ( !base.transmitRoomOnce && !that.leaving ) {
                        setTimeout(transmit, 100) // original: 3000
                    }
                })();
            },
            joinRoom(_config) {
                self.roomToken = _config.roomToken
                isGetNewRoom = false

                newPrivateSocket({
                    channel: self.userToken
                })

                defaultSocket.send({
                    participant: true,
                    userToken: self.userToken,
                    joinUser: _config.joinUser
                })
            },
            send(message, _channel) {
                let _channels = rtcDataChannels,
                    data,
                    length = _channels.length

                if ( !length ) {
                    return
                }

                data = JSON.stringify(message)

                if ( _channel ) {
                    if ( _channel.readyState === 'open' ) {
                        _channel.send(data)
                    }
                    return
                }
                for (let i = 0; i < length; i++) {
                     if ( _channels[i].readyState === 'open' ) {
                         _channels[i].send(data)
                     }
                }
            },
            leave(userid, autoCloseEntireSession) {
                if ( autoCloseEntireSession ) {
                    base.autoCloseEntireSession = true
                }
                leaveChannels(userid)
                if ( !userid ) {
                    self.joinedARoom = isbroadcaster = false
                    isGetNewRoom = true
                }
            }
        }
    }

    const swap = arr => {
        let swapped = [],
            length = arr.length

        for (let i = 0; i < length; i++) {
             if ( arr[i] ) {
                swapped.push(arr[i])
             }
        }

        return swapped
    }

    const RTCPeerConnection = function(options) {
        let PeerConnection = wd.mozRTCPeerConnection || wd.webkitRTCPeerConnection,
            SessionDescription = wd.mozRTCSessionDescription || wd.RTCSessionDescription,
            IceCandidate = wd.mozRTCIceCandidate || wd.RTCIceCandidate,
            channel,

            iceServers = {
                iceServers: [
                    {
                        'urls': 'stun:stun.stunprotocol.org:3478'
                    },
                    {
                        'urls': 'stun:stun.l.google.com:19302'
                    },
                    {
                        'urls': 'stun:stun.services.mozilla.com'
                    }/*,
                    {
                        'urls': 'turn:webrtcweb.com:4455',
                        'credential': 'muazkh',
                        'username': 'muazkh'
                    },
                    {
                        'urls': 'turn:webrtcweb.com:5544?transport=tcp',
                        'credential': 'muazkh',
                        'username': 'muazkh'
                    }*/
                ]

            },

            optional = {
                optional: []
            }

        if ( !nv.onLine ) {
            iceServers = null
            Debug('[AuthChainDataChannel]: No internet connection detected. No STUN/TURN server is used to make sure local/host candidates are used for peers connection.')
        }

        let peerConnection = new PeerConnection(iceServers, optional)

        openOffererChannel()
        peerConnection.onicecandidate = onicecandidate

        function onicecandidate(event) {
            if ( !event.candidate || !peerConnection ) {
                return
            }

            if ( options.onICE ) {
                options.onICE(event.candidate)
            }

            /**
             * @REVISE: match just the IP address (experimental)
             */
            let ip_regex = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/,
                ip_addr = ip_regex.exec(event.candidate.candidate)[1]
            // remove duplicates
            if ( ip_dups[ip_addr] === undefined ) {
                Debug(`[AuthChainDataChannel]: ip: ${ip_addr}`)
            }

            ip_dups[ip_addr] = true

        }

        let constraints = options.constraints || {
            optional: [],
            mandatory: {
                OfferToReceiveAudio: false,
                OfferToReceiveVideo: false
            }
        }

        function onSdpError(e) {
            let message = JSON.stringify(e, null, '\t')

            if ( message.indexOf('RTP/SAVPF Expects at least 4 fields') !== -1 ) {
                message = 'It seems that you are trying to interop RTP-datachannels with SCTP. It is not supported!'
            }

            Debug('[AuthChainDataChannel]: onSdpError:', message)
        }

        function onSdpSuccess() {}

        function createOffer() {
            if ( !options.onOfferSDP ) {
                return
            }

            peerConnection.createOffer(sessionDescription => {
                peerConnection.setLocalDescription(sessionDescription)
                options.onOfferSDP(sessionDescription)
            }, onSdpError, constraints)
        }

        function createAnswer() {
            if ( !options.onAnswerSDP ) {
                return
            }

            options.offerSDP = new SessionDescription(options.offerSDP)
            peerConnection.setRemoteDescription(options.offerSDP, onSdpSuccess, onSdpError)

            peerConnection.createAnswer(sessionDescription => {
                peerConnection.setLocalDescription(sessionDescription)
                options.onAnswerSDP(sessionDescription)
            }, onSdpError, constraints)
        }

        if ( !moz ) {
            createOffer()
            createAnswer()
        }

        function openOffererChannel() {
            if ( moz && !options.onOfferSDP ) {
                return
            }

            if ( !moz && !options.onOfferSDP ) {
                return
            }

            _openOffererChannel()
            if ( moz ) {
                createOffer()
            }
        }

        function _openOffererChannel() {
            // protocol: 'text/chat', preset: true, stream: 16
            // maxRetransmits:0 && ordered:false
            let dataChannelDict = {}

            Debug('[AuthChainDataChannel]: dataChannelDict', dataChannelDict)

            channel = peerConnection.createDataChannel('channel', dataChannelDict)
            setChannelEvents()
        }

        function setChannelEvents() {
            channel.onmessage = options.onmessage
            channel.onopen = function() {
                options.onopen(channel)
            }
            channel.onclose = options.onclose
            channel.onerror = options.onerror
        }

        if ( options.onAnswerSDP && moz && options.onmessage ) {
            openAnswererChannel()
        }

        if ( !moz && !options.onOfferSDP ) {
            openAnswererChannel()
        }

        function openAnswererChannel() {
            peerConnection.ondatachannel = function(event) {
                channel = event.channel
                setChannelEvents()
            }

            if ( moz ) {
                createAnswer()
            }
        }

        function useless() {}

        return {
            addAnswerSDP(sdp) {
                sdp = new SessionDescription(sdp)
                peerConnection.setRemoteDescription(sdp, onSdpSuccess, onSdpError)
            },
            addICE(candidate) {
                peerConnection.addIceCandidate(new IceCandidate({
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    candidate: candidate.candidate
                }))
            },

            peer: peerConnection,
            channel: channel,
            sendData(message) {
                if ( !channel ) {
                    return
                }

                channel.send(message)
            }
        }
    }

    const TextReceiver = function() {
        let content = {}

        let receive = (data, onmessage, userid) => {
            // uuid is used to uniquely identify sending instance
            let uuid = data.uuid
            if ( !content[uuid] ) {
                content[uuid] = []
            }

            content[uuid].push(data.message)
            if ( data.last ) {
                let message = content[uuid].join('')
                if ( data.isobject ) {
                    message = JSON.parse(message)
                }

                // latency detection
               let receivingTime = new Date().getTime(),
                    latency = receivingTime - data.sendingTime

                onmessage(message, userid, latency)

                delete content[uuid]
            }
        }

        return {
            receive: receive
        }
    }

    const TextSender = {
        send(config) {
            let base = config.base,
                channel = config.channel,
                _channel = config._channel,
                initialText = config.text,
                packetSize = base.chunkSize || 1000,
                textToTransfer = '',
                isobject = false

            if ( typeof initialText !== 'string' ) {
                isobject = true
                initialText = JSON.stringify(initialText)
            }

            // uuid is used to uniquely identify sending instance
            let uuid = getRandomString(),
                sendingTime = new Date().getTime()

            let sendText = (textMessage, text) => {
                let data = {
                    type: 'text',
                    uuid: uuid,
                    sendingTime: sendingTime
                }

                if ( textMessage ) {
                    text = textMessage
                    data.packets = parseInt(text.length / packetSize)
                }

                if ( text.length > packetSize ) {
                    data.message = text.slice(0, packetSize)
                } else {
                    data.message = text
                    data.last = true
                    data.isobject = isobject
                }

                channel.send(data, _channel)

                textToTransfer = text.slice(data.message.length)

                if ( textToTransfer.length ) {
                    setTimeout(() => {
                        sendText(null, textToTransfer)
                    }, base.chunkInterval || 100)
                }
            }

            sendText(initialText)
        }
    }


    const UTILS = {
        /**
         * Handler of `localStorage`
         */
        Local: {
            /**
             * Get (request) entire
             * @param  {String} key       - index of entire
             * @param  {String} regex     - for generate {RegExp}
             * @return {String|Undefined} - with by "RegExp" return {String|Undefined|Null}
             */
            get(key, regex) {
                let keys = Object.keys(ss).join('; ')
                if ( !!regex && typeof regex === 'string' ) {
                    let r = new RegExp('[; ]' + regex + '([^\\s;]*)')
                    let m = (' ' + keys).match(r)
                    return (!!m) ? ls.getItem(regex + m[1]) : null
                } else {
                    return ls.getItem(key)
                }
            },
            /**
             * Set (create) entire
             * @param {String} key          - index of entire
             * @param {String|Object|Array} - entire value [note: {Object|Array} use `JSON.stringify`]
             */
            set(key, val) {
                if ( typeof val !== 'string' ) {
                    ls.setItem(key, JSON.stringify(val))
                    return
                }
                ls.setItem(key, val)
            },
            /**
             * Delete (remove) entire
             * @param {String} key - index of entire
             */
            del(key) {
                ls.removeItem(key)
            },
            /**
             * Get (request) all entires
             * @param  {String} regex - for generate {RegExp}
             * @return {Array}        - lot of entires [or empty]
             */
            all(regex) {
                let keys = Object.keys(ss),
                    result = [],
                    self = this
                if ( regex && typeof regex === 'string' ) {
                    let r = new RegExp(regex)
                    keys.forEach((key, i) => {
                        if ( r.test(key) ) {
                            result.push({
                                key: key,
                                value: self.get(key)
                            })
                        }
                    })
                } else {
                    keys.forEach((key, i) => {
                        result.push({
                            key: key,
                            value: self.get(key)
                        })
                    })
                }
                return result
            },
            /**
             * Get (request) `JSON` values has been parsed (using `JSON.parse`)
             * @param  {String} key   - index of entire
             * @param  {String} regex - for generate {RegEx}
             * @return {String|Undefined|Null}
             */
            json(key, regex) {
                return this.get(key, regex) ? JSON.parse(this.get(key, regex)) : null
            },
            /**
             * Clear (remove) all entires from `localStorage`
             */
            clear() {
                ls.clear()
            }
        },

        /**
         * Array merge [no duplicates]
         * @param  {Array} origin  - orinal {Array}
         * @param  {Array}(s) args - objects to merge
         * @return {Array}         - original or merged result
         */
        Merge(origin, ...args) {
            if ( !Array.isArray(...args) ) {
                return origin
            }
            // no duplicates ordered by "sort()"
            return Array.from(
                new Set(origin.concat(...args))
            ).sort()
        },

        /**
         * Extend objects - simple and minimalist merge objects
         * @arguments {Object}(s) - objects to merge
         * @return    {Object}    - merged objects
         * @throws    {Object}    - return "empty" object
         */
        Extend(...args) {
            try {
                return Object.assign(...args)
            } catch(e) {
                return {}
            }
        }
    }

    const __DEBUG__ = console.debug

    /**
     * __SETUP__ - Initial setup connection to webserver of signaling
     * @param  {Object} settings -
     * @return {Object}:Promise  - `Promise.resolve()` return `{Object}` (DataChannel and settings)
     */
    const __SETUP__ = settings => {
        return new Promise((resolve, reject) => {
            if ( typeof settings !== 'object' && !('server' in settings) ) {
                throw new Error(`AuthChainJS requires valid {Object} configuration with key "server"`)
            }
            if ( !/wss:\/\//g.test(settings.server) ) {
                reject('Failed, Signaling Server URL not is WebSoket protocol!')
            } else {
                // Debug
                Debug = (('debug' in settings) && settings.debug) ? __DEBUG__ : noop

                let SignalingSettings,
                    Local = UTILS.Local,
                    defaultSignaling = {
                        prefered: settings.server,
                        list: [],
                        pool: false
                    }

                try {
                    SignalingSettings = !Local.get('__AUTHCHAIN_SIGNALING__') ? defaultSignaling : Local.json('__AUTHCHAIN_SIGNALING__')
                } catch(e) {
                    SignalingSettings = defaultSignaling
                }

                // IEEF Setup WebSocket Connetion
                ;(function SetupWebSocketConnect() {
                    let AttempyNewConnection = () => {
                        if ( SignalingSettings.list.length >= 1 ) {
                            SignalingSettings.prefered = SignalingSettings.list[0]
                            SignalingSettings.list = SignalingSettings.list.splice(0, 1)
                            setTimeout(() => {
                                SetupWebSocketConnect()
                            }, 700)
                        } else {
                            Debug(`[AuthChainDataChannel]: Failed connect on server: ${SignalingSettings.prefered} ... no have more signaling server's!`)
                        }
                    }
                    let ws = new WebSocket(SignalingSettings.prefered)
                    ws.onopen = function() {
                        if ( ('readyState' in ws) && ws.readyState === 1 ) {
                            Debug('[AuthChainDataChannel]: Open socket connection')
                            ws.send(JSON.stringify({
                                setupconn: true,
                                targetpool: SignalingSettings.pool
                            }))
                        }
                    }
                    ws.onmessage = function(e) {
                        Debug('[AuthChainDataChannel]: Receive socket message')
                        let data = JSON.parse(e.data)
                        SignalingSettings.list = UTILS.Merge(SignalingSettings.list, data.list)
                        SignalingSettings.pool = data.pool
                        // close this connection (deliberate)
                        ws.close(1000, 'Deliberate disconnection')
                    }
                    ws.onclose = function(CloseEvent) {
                        Debug(`[AuthChainDataChannel]: Socket is clossed, code: ${CloseEvent.code} - reason: ${CloseEvent.reason}`)
                        if ( ('code' in CloseEvent) && CloseEvent.code === 1000 && ('reason' in CloseEvent) && CloseEvent.reason === 'Deliberate disconnection' ) {
                            // successfull WebSockets initial setup
                            Local.set('__AUTHCHAIN_SIGNALING__', SignalingSettings)
                            // enable DataChannel connection
                            resolve({
                                channel: DataChannel,
                                server: SignalingSettings.prefered,
                                pool: SignalingSettings.pool
                            })
                        } else {
                            // attempy new connection by list of backnodes
                            AttempyNewConnection()
                        }
                    }
                    ws.onerror = function(e) {
                        // console.error(e)
                        Debug('[AuthChainDataChannel]: Socket encountered error: ', e.message, 'Closing socket')
                        ws.close()
                        AttempyNewConnection()
                    }
                })();
            }
        })
    }

    /** ------------------------------------------------------------------------------------------|
     * Plugin {Object} [matrix]
     * @param {Date} firstInit - timestamp reference to allow internal first instance (with PluginExtend)
     */
    let Plugin = function(firstInit) {
        // accept only new instance
        if ( !this instanceof Plugin ) {
            throw new Error('Plugin isn\'t initialized! This call is not instance of Plugin!')
        } else if ( alreadyInstancied ) {
            // plugin reached limit of two instances (remember: [first -> PluginExtend], [second -> Plugin exports])
            throw new Error('Plugin already initialized! Only accept one instance of Plugin!')
        } else if ( !firstInit || firstInit !== firstInstance ) {
            // instance of "exports"
            alreadyInstancied = true // make refferer to limit reached of instances (max 2)
        } else {
            // ...
            return this
        }
    }

    /** ------------------------------------------------------------------------------------------|
     * launch to global scope
     */
    const PluginExtend = new Plugin(firstInstance)

    /**
     * Commodities Plugin exportable (prototypes by "context")
     */
    if ( IsWebBrowserContext ) {
        Plugin.prototype.Config = __SETUP__
    } else {
        throw new Error('Context unidentified or not allowed ... please, this plugin running only Browser (window top) context')
    }

    /** ------------------------------------------------------------------------------------------|
     * exports [...]
     */
    exports.AuthChainJSDataChannel = new Plugin()
});
